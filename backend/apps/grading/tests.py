from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.test.utils import override_settings
import tempfile
from unittest.mock import patch
from rest_framework.exceptions import ValidationError

from apps.accounts.management.commands.seed_demo import DEMO_STEPS
from apps.accounts.models import User
from apps.courses.models import Course, DraftStep
from apps.courses.services import publish_course
from apps.courses.step_types import validate_step_content
from apps.learning.models import Enrollment, Submission


class SubmissionApiTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username="grading_admin", password="pass", role=User.Role.ADMIN)
        cls.student = User.objects.create_user(username="grading_student", password="pass", role=User.Role.STUDENT)
        cls.other = User.objects.create_user(username="grading_other", password="pass", role=User.Role.STUDENT)
        cls.curator = User.objects.create_user(username="grading_curator", password="pass", role=User.Role.CURATOR)
        course = Course.objects.create(title="Grading", owner=cls.admin)
        for position, (kind, title, content, score) in enumerate(DEMO_STEPS, start=1):
            DraftStep.objects.create(course=course, type_key=kind, position=position, title=title, content=content, max_score=score)
        DraftStep.objects.create(
            course=course, type_key="quiz.multiple_choice", position=len(DEMO_STEPS) + 1,
            title="Несколько правильных ответов",
            content={
                "question": "Какие числа чётные?",
                "choices": [{"id": "a", "text": "2"}, {"id": "b", "text": "3"}, {"id": "c", "text": "4"}],
                "correct_option_ids": ["a", "c"],
            },
            max_score=5,
        )
        revision = publish_course(course_id=course.id, actor=cls.admin)
        cls.enrollment = Enrollment.objects.create(revision=revision, student=cls.student, curator=cls.curator)
        cls.steps = {step.type_key: step for step in revision.steps.all()}

    def setUp(self):
        self.client.force_login(self.student)

    def path(self, kind):
        return f"/api/v1/student/enrollments/{self.enrollment.pk}/steps/{self.steps[kind].pk}/submissions"

    def post(self, kind, data, key=None):
        headers = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
        return self.client.post(self.path(kind), data, content_type="application/json", **headers)

    def test_theory_accepts_once_and_progress_awards_once(self):
        first = self.post("theory", '{"action":"complete"}')
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(first.json()["data"]["status"], "accepted")
        self.assertEqual(self.post("theory", '{"action":"complete"}').status_code, 409)
        progress = self.client.get(f"/api/v1/student/enrollments/{self.enrollment.pk}/progress").json()["data"]
        self.assertEqual((progress["completed_steps"], progress["earned_points"]), (1, 5))

    def test_quiz_retry_history_and_idempotency(self):
        first = self.post("quiz.single_choice", '{"answer":"a"}', "key-one")
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(first.json()["data"]["status"], "incorrect")
        self.assertEqual(self.post("quiz.single_choice", '{"answer":"a"}', "key-one").status_code, 200)
        self.assertEqual(self.post("quiz.single_choice", '{"answer":"b"}', "key-one").status_code, 409)
        second = self.post("quiz.single_choice", '{"answer":"b"}')
        self.assertEqual(second.status_code, 201, second.content)
        self.assertEqual(second.json()["data"]["attempt_number"], 2)
        history = self.client.get(self.path("quiz.single_choice")).json()["data"]
        self.assertEqual([item["status"] for item in history], ["accepted", "incorrect"])
        self.assertNotIn("correct_option_id", str(history))

    def test_multiple_choice_requires_the_complete_set_of_valid_options(self):
        first = self.post("quiz.multiple_choice", '{"answer":["a"]}')
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(first.json()["data"]["status"], "incorrect")
        self.assertEqual(self.post("quiz.multiple_choice", '{"answer":["a","a"]}').status_code, 400)
        accepted = self.post("quiz.multiple_choice", '{"answer":["c","a"]}')
        self.assertEqual(accepted.status_code, 201, accepted.content)
        self.assertEqual(accepted.json()["data"]["status"], "accepted")
        self.assertEqual(accepted.json()["data"]["score"], 5)

    def test_rejects_wrong_type_extra_fields_and_foreign_access(self):
        self.assertEqual(self.post("theory", '{"answer":"x"}').status_code, 400)
        self.assertEqual(self.post("answer.exact", '{"answer":"101","score":5}').status_code, 400)
        self.assertEqual(self.post("theory", "null").status_code, 400)
        self.assertEqual(self.post("theory", '[{"action":"complete"}]').status_code, 400)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.path("theory")).status_code, 404)

    def test_python_challenge_and_limits(self):
        kind = "algorithm.python"
        challenge_path = self.path(kind).removesuffix("/submissions") + "/python-challenge"
        response = self.client.post(challenge_path, '{"code":"print(5)"}', content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        challenge = response.json()["data"]
        self.assertTrue(all("output" not in item for item in challenge["tests"]))
        self.assertEqual(challenge["limits"]["time_limit_ms"], 1000)
        results = [
            {"id": 0, "stdout": "5\n", "exit_code": 0, "duration_ms": 50, "peak_memory_bytes": 1024},
            {"id": 1, "stdout": "3\n", "exit_code": 0, "duration_ms": 50, "peak_memory_bytes": 1024},
        ]
        import json
        body = {"code": "print(5)", "challenge_token": challenge["challenge_token"], "results": results}
        self.assertEqual(self.post(kind, json.dumps({**body, "code": "print(6)"})).status_code, 400)
        results[0]["duration_ms"] = 1001
        graded = self.post(kind, json.dumps(body))
        self.assertEqual(graded.status_code, 201, graded.content)
        self.assertEqual(graded.json()["data"]["status"], "incorrect")
        self.assertEqual(graded.json()["data"]["safe_diagnostics"]["reason"], "time_limit")
        self.assertEqual(Submission.objects.get(pk=graded.json()["data"]["id"]).score, 0)

    def test_python_correct_output_and_environment_error(self):
        import json
        kind = "algorithm.python"
        code = "a, b = map(int, input().split()); print(a + b)"
        challenge_path = self.path(kind).removesuffix("/submissions") + "/python-challenge"
        challenge = self.client.post(challenge_path, json.dumps({"code": code}), content_type="application/json").json()["data"]
        results = [{"id": index, "stdout": output, "exit_code": 0, "duration_ms": 20, "peak_memory_bytes": 1024}
                   for index, output in enumerate(("5\n", "3\n"))]
        body = {"code": code, "challenge_token": challenge["challenge_token"], "results": results}
        results[0]["exit_code"] = 125
        errored = self.post(kind, json.dumps(body))
        self.assertEqual(errored.status_code, 201)
        self.assertEqual(errored.json()["data"]["status"], "error")
        results[0]["exit_code"] = 0
        accepted = self.post(kind, json.dumps(body))
        self.assertEqual(accepted.status_code, 201, accepted.content)
        self.assertEqual(accepted.json()["data"]["status"], "accepted")
        self.assertEqual(accepted.json()["data"]["score"], 10)

    def test_long_python_challenge_remains_valid_for_allowed_test_budget(self):
        import json
        course = Course.objects.create(title="Long Python challenge", owner=self.admin)
        for position, (kind, title, content, score) in enumerate(DEMO_STEPS, start=1):
            if kind == "algorithm.python":
                content = {**content, "time_limit_ms": 30000,
                           "tests": [{"input": "", "output": "ok\n"} for _ in range(50)]}
            DraftStep.objects.create(course=course, type_key=kind, position=position,
                                     title=title, content=content, max_score=score)
        revision = publish_course(course_id=course.id, actor=self.admin)
        enrollment = Enrollment.objects.create(revision=revision, student=self.student, curator=self.curator)
        step = revision.steps.get(type_key="algorithm.python")
        path = f"/api/v1/student/enrollments/{enrollment.pk}/steps/{step.pk}"
        code = "print('ok')"
        issued_at = 1_800_000_000
        with patch("django.core.signing.time.time", return_value=issued_at):
            response = self.client.post(path + "/python-challenge", json.dumps({"code": code}),
                                        content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        challenge = response.json()["data"]
        self.assertGreater(challenge["expires_in_seconds"], 50 * 30)
        results = [{"id": index, "stdout": "ok\n", "exit_code": 0,
                    "duration_ms": 29000, "peak_memory_bytes": 1024} for index in range(50)]
        body = {"code": code, "challenge_token": challenge["challenge_token"], "results": results}
        with patch("django.core.signing.time.time", return_value=issued_at + 1600):
            graded = self.client.post(path + "/submissions", json.dumps(body), content_type="application/json")
        self.assertEqual(graded.status_code, 201, graded.content)
        self.assertEqual(graded.json()["data"]["status"], "accepted")

    def test_short_python_challenge_expires_after_ten_minutes(self):
        import json
        kind = "algorithm.python"
        code = "print(5)"
        path = self.path(kind)
        issued_at = 1_800_000_000
        with patch("django.core.signing.time.time", return_value=issued_at):
            challenge = self.client.post(path.removesuffix("/submissions") + "/python-challenge",
                                         json.dumps({"code": code}), content_type="application/json").json()["data"]
        self.assertEqual(challenge["expires_in_seconds"], 600)
        results = [{"id": index, "stdout": output, "exit_code": 0,
                    "duration_ms": 10, "peak_memory_bytes": 1024}
                   for index, output in enumerate(("5\n", "3\n"))]
        with patch("django.core.signing.time.time", return_value=issued_at + 601):
            expired = self.post(kind, json.dumps({"code": code, "challenge_token": challenge["challenge_token"],
                                                  "results": results}))
        self.assertEqual(expired.status_code, 400, expired.content)
        self.assertIn("challenge_token", expired.json()["error"]["fields"])

    def test_manual_url_queue_and_private_artifact(self):
        url_result = self.post("artifact.scratch", '{"url":"https://example.org/project.sb3"}')
        self.assertEqual(url_result.status_code, 201, url_result.content)
        self.assertEqual(url_result.json()["data"]["status"], "pending_review")
        self.assertEqual(self.post("artifact.scratch", '{"url":"https://example.org/again"}').status_code, 409)
        file_path = self.path("artifact.minecraft")
        upload = SimpleUploadedFile("program.exe", b"bad")
        bad = self.client.post(file_path, {"file": upload})
        self.assertEqual(bad.status_code, 400, bad.content)

    def test_composite_artifact_keeps_all_evidence_for_curator(self):
        path = self.path("artifact.minecraft")
        self.assertEqual(self.post("artifact.minecraft", '{"explanation":"Только пояснение"}').status_code, 400)
        url = "https://example.org/minecraft/project"
        explanation = "Снимок мира и ссылка на проект"

        def upload():
            return SimpleUploadedFile("world.png", b"\x89PNG\r\n\x1a\nimage")

        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            form = {"file": upload(), "url": url, "explanation": explanation}
            sent = self.client.post(path, form, HTTP_IDEMPOTENCY_KEY="combined")
            self.assertEqual(sent.status_code, 201, sent.content)
            submission = sent.json()["data"]
            self.assertEqual(submission["status"], "pending_review")
            self.assertEqual((submission["artifact_url"], submission["explanation"]), (url, explanation))
            self.assertIsNotNone(submission["download_url"])
            self.assertEqual(self.client.get(submission["download_url"]).status_code, 200)
            self.assertEqual(Submission.objects.get(pk=submission["id"]).payload["explanation"], explanation)

            repeated = self.client.post(path, {"file": upload(), "url": url, "explanation": explanation},
                                        HTTP_IDEMPOTENCY_KEY="combined")
            self.assertEqual(repeated.status_code, 200, repeated.content)
            self.assertEqual(repeated.json()["data"]["id"], submission["id"])
            changed = self.client.post(path, {"file": upload(), "url": url, "explanation": "Другая работа"},
                                       HTTP_IDEMPOTENCY_KEY="combined")
            self.assertEqual(changed.status_code, 409, changed.content)

            self.client.force_login(self.other)
            self.assertEqual(self.client.get(submission["download_url"]).status_code, 404)
            self.client.force_login(self.curator)
            detail_path = f"/api/v1/curator/submissions/{submission['id']}"
            detail = self.client.get(detail_path)
            self.assertEqual(detail.status_code, 200, detail.content)
            self.assertEqual(detail.json()["data"]["explanation"], explanation)
            self.assertEqual(detail.json()["data"]["artifact_url"], url)
            self.assertEqual(self.client.get(detail.json()["data"]["download_url"]).status_code, 200)
            returned = self.client.post(detail_path + "/review", '{"decision":"returned","comment":"Дополните"}',
                                        content_type="application/json")
            self.assertEqual(returned.status_code, 200, returned.content)
            self.client.force_login(self.student)
            retry = self.post("artifact.minecraft", '{"url":"https://example.org/minecraft/revised"}')
            self.assertEqual(retry.status_code, 201, retry.content)
            self.assertEqual(retry.json()["data"]["attempt_number"], 2)

    @override_settings(MAX_UPLOAD_SIZE=4)
    def test_file_above_configured_size_returns_413(self):
        oversized = SimpleUploadedFile("result.png", b"\x89PNG\r\n\x1a\n")
        response = self.client.post(self.path("artifact.scratch"), {"file": oversized})
        self.assertEqual(response.status_code, 413, response.content)
        self.assertEqual(response.json()["error"]["code"], "file_too_large")

    def test_file_signature_and_private_download(self):
        path = self.path("artifact.minecraft")
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            self.assertEqual(self.client.post(path, {"file": SimpleUploadedFile("world.mcworld", b"bad")}).status_code, 400)
            sent = self.client.post(path, {"file": SimpleUploadedFile("world.mcworld", b"PK\x03\x04demo")})
            self.assertEqual(sent.status_code, 201, sent.content)
            download = sent.json()["data"]["download_url"]
            self.assertEqual(self.client.get(download).status_code, 200)
            self.client.force_login(self.other)
            self.assertEqual(self.client.get(download).status_code, 404)

    def test_required_manual_evidence_and_curator_only_criteria(self):
        content = {
            "instructions": "Пришлите снимок, ссылку и объяснение",
            "required_evidence": ["file", "url", "explanation"],
            "review_criteria": "Проверьте мост и работу агента",
        }
        course = Course.objects.create(title="Project evidence", owner=self.admin)
        for position, (kind, title, body, score) in enumerate(DEMO_STEPS[:2], start=1):
            DraftStep.objects.create(course=course, type_key=kind, position=position,
                                     title=title, content=body, max_score=score)
        DraftStep.objects.create(course=course, type_key="artifact.minecraft", position=3,
                                 title="Мост", content=content, max_score=10)
        revision = publish_course(course_id=course.pk, actor=self.admin)
        enrollment = Enrollment.objects.create(revision=revision, student=self.student, curator=self.curator)
        step = revision.steps.get(type_key="artifact.minecraft")
        step_path = f"/api/v1/student/enrollments/{enrollment.pk}/steps/{step.pk}"
        submission_path = step_path + "/submissions"

        student_content = self.client.get(step_path).json()["data"]["content"]
        self.assertEqual(student_content["required_evidence"], content["required_evidence"])
        self.assertNotIn("review_criteria", student_content)
        self.assertNotIn("review_criteria", str(self.client.get(
            f"/api/v1/student/enrollments/{enrollment.pk}").json()))
        question = self.client.post(step_path + "/questions", '{"question":"Как построить мост?"}',
                                    content_type="application/json")
        self.assertEqual(question.status_code, 201, question.content)
        self.assertNotIn("review_criteria", str(question.json()))

        missing_cases = (
            ({"url": "https://example.org/makecode"}, {"file", "explanation"}),
            ({"file": SimpleUploadedFile("bridge.png", b"\x89PNG\r\n\x1a\n")}, {"url", "explanation"}),
            ({"file": SimpleUploadedFile("bridge.png", b"\x89PNG\r\n\x1a\n"),
              "url": "https://example.org/makecode"}, {"explanation"}),
            ({"url": "https://example.org/makecode", "explanation": "  "}, {"file", "explanation"}),
        )
        for payload, missing in missing_cases:
            response = self.client.post(submission_path, payload)
            self.assertEqual(response.status_code, 400, response.content)
            self.assertTrue(missing.issubset(response.json()["error"]["fields"]), response.content)
        self.assertFalse(Submission.objects.filter(enrollment=enrollment, step=step).exists())

        sent = self.client.post(submission_path, {
            "file": SimpleUploadedFile("bridge.png", b"\x89PNG\r\n\x1a\n"),
            "url": "https://example.org/makecode",
            "explanation": "Агент построил мост",
        })
        self.assertEqual(sent.status_code, 201, sent.content)
        self.assertEqual(sent.json()["data"]["status"], "pending_review")
        self.assertNotIn("review_criteria", str(sent.json()))
        self.client.force_login(self.curator)
        detail = self.client.get(f"/api/v1/curator/submissions/{sent.json()['data']['id']}")
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(detail.json()["data"]["step"]["content"]["review_criteria"], content["review_criteria"])
        self.assertNotIn("review_criteria", str(self.client.get("/api/v1/curator/questions").json()))

    def test_manual_step_rejects_invalid_evidence_rules(self):
        for required in ([], ["explanation"], ["url", "url"], ["url", "archive"]):
            with self.assertRaises(ValidationError):
                validate_step_content("artifact.minecraft", 1, {
                    "instructions": "Мост", "required_evidence": required,
                })
        with self.assertRaises(ValidationError):
            validate_step_content("artifact.minecraft", 1, {
                "instructions": "Мост", "review_criteria": " ",
            })

    def test_python_limits_rejected_before_publishing(self):
        content = dict(DEMO_STEPS[3][2], time_limit_ms=0)
        with self.assertRaises(ValidationError):
            validate_step_content("algorithm.python", 1, content)
        content = dict(DEMO_STEPS[3][2], tests=[{"input": "x" * (64 * 1024 + 1), "output": ""}])
        with self.assertRaises(ValidationError):
            validate_step_content("algorithm.python", 1, content)
