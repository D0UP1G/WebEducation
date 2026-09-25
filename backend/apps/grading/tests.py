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

    def test_python_sample_exposes_only_one_open_example(self):
        kind = "algorithm.python"
        path = self.path(kind).removesuffix("/submissions") + "/python-sample"
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200, response.content)
        sample = response.json()["data"]
        self.assertEqual(sample["sample"], {"input": "2 3\n", "output": "5\n"})
        self.assertNotIn("tests", sample)
        self.assertEqual(sample["limits"]["time_limit_ms"], 1000)
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(path).status_code, 404)

    def test_python_official_grade_accepts_only_code_and_uses_runner(self):
        import json
        kind = "algorithm.python"
        code = "a, b = map(int, input().split()); print(a + b)"
        with patch("apps.grading.services.grade_python", return_value={
            "status": "accepted", "passed_tests": 2, "total_tests": 2, "reason": None,
        }) as runner:
            rejected = self.post(kind, json.dumps({"code": code, "results": [{"stdout": "5\n"}]}))
            self.assertEqual(rejected.status_code, 400, rejected.content)
            self.assertEqual(runner.call_count, 0)
            accepted = self.post(kind, json.dumps({"code": code}))
        self.assertEqual(accepted.status_code, 201, accepted.content)
        self.assertEqual(accepted.json()["data"]["status"], "accepted")
        self.assertEqual(accepted.json()["data"]["score"], 10)
        self.assertEqual(runner.call_args.kwargs["code"], code)
        self.assertEqual(runner.call_args.kwargs["tests"], self.steps[kind].content["tests"])

    def test_python_wrong_answer_and_runner_failure(self):
        import json
        from apps.grading.runner_client import RunnerUnavailable
        kind = "algorithm.python"
        with patch("apps.grading.services.grade_python", return_value={
            "status": "incorrect", "passed_tests": 1, "total_tests": 2, "reason": "wrong_answer",
        }):
            incorrect = self.post(kind, json.dumps({"code": "print(5)"}))
        self.assertEqual(incorrect.status_code, 201, incorrect.content)
        self.assertEqual(incorrect.json()["data"]["safe_diagnostics"]["reason"], "wrong_answer")
        self.assertEqual(incorrect.json()["data"]["score"], 0)
        with patch("apps.grading.services.grade_python", side_effect=RunnerUnavailable()):
            unavailable = self.post(kind, json.dumps({"code": "print(5)"}))
        self.assertEqual(unavailable.status_code, 503, unavailable.content)
        self.assertEqual(Submission.objects.filter(step=self.steps[kind]).count(), 1)

    def test_python_environment_error_is_retryable_and_idempotent(self):
        import json
        kind = "algorithm.python"
        body = json.dumps({"code": "print(5)"})
        with patch("apps.grading.services.grade_python", return_value={
            "status": "error", "passed_tests": 0, "total_tests": 2, "reason": "environment_error",
        }) as runner:
            first = self.post(kind, body, key="python-error")
            repeated = self.post(kind, body, key="python-error")
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(first.json()["data"]["status"], "error")
        self.assertIsNone(first.json()["data"]["score"])
        self.assertEqual(repeated.status_code, 200, repeated.content)
        self.assertEqual(repeated.json()["data"]["id"], first.json()["data"]["id"])
        self.assertEqual(runner.call_count, 1)
        with patch("apps.grading.services.grade_python", return_value={
            "status": "accepted", "passed_tests": 2, "total_tests": 2, "reason": None,
        }):
            retry = self.post(kind, body, key="python-retry")
        self.assertEqual(retry.status_code, 201, retry.content)
        self.assertEqual(retry.json()["data"]["status"], "accepted")
        self.assertEqual(retry.json()["data"]["attempt_number"], 2)

    def test_python_runner_busy_fails_without_waiting(self):
        import fcntl
        import os
        from apps.grading.runner_client import RunnerUnavailable, grade_python
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "grading.sock")
            with open(path + ".lock", "a+b") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with patch.dict(os.environ, {"RUNNER_SOCKET": path}):
                    with self.assertRaises(RunnerUnavailable) as raised:
                        grade_python(code="print(5)", tests=self.steps["algorithm.python"].content["tests"],
                                     limits={"time_limit_ms": 1000, "memory_limit_mb": 128,
                                             "output_limit_bytes": 65536})
            self.assertIsInstance(raised.exception.__cause__, BlockingIOError)

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
            student_download = self.client.get(submission["download_url"])
            try:
                self.assertEqual(student_download.status_code, 200)
            finally:
                student_download.close()
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
            curator_download = self.client.get(detail.json()["data"]["download_url"])
            try:
                self.assertEqual(curator_download.status_code, 200)
            finally:
                curator_download.close()
            returned = self.client.post(detail_path + "/review", '{"decision":"returned","comment":"Дополните"}',
                                        content_type="application/json")
            self.assertEqual(returned.status_code, 200, returned.content)
            self.client.force_login(self.student)
            retry = self.post("artifact.minecraft", '{"url":"https://example.org/minecraft/revised"}')
            self.assertEqual(retry.status_code, 201, retry.content)
            self.assertEqual(retry.json()["data"]["attempt_number"], 2)

    def test_organizer_scratch_answer_and_project_types(self):
        course = Course.objects.create(title="Organizer step types", owner=self.admin)
        for position, (kind, title, content, score) in enumerate(DEMO_STEPS[:2], start=1):
            DraftStep.objects.create(course=course, type_key=kind, position=position,
                                     title=title, content=content, max_score=score)
        DraftStep.objects.create(
            course=course, type_key="scratch.numeric_answer", position=3,
            title="Scratch: шаги спрайта", content={"prompt": "Сколько шагов?", "accepted_answers": ["20"]},
            max_score=5,
        )
        DraftStep.objects.create(
            course=course, type_key="artifact.project", position=4,
            title="Проект Scratch", content={"instructions": "Пришлите ссылку на проект"}, max_score=10,
        )
        revision = publish_course(course_id=course.id, actor=self.admin)
        enrollment = Enrollment.objects.create(revision=revision, student=self.student, curator=self.curator)
        scratch = revision.steps.get(type_key="scratch.numeric_answer")
        project = revision.steps.get(type_key="artifact.project")

        scratch_path = f"/api/v1/student/enrollments/{enrollment.pk}/steps/{scratch.pk}"
        visible_step = self.client.get(scratch_path)
        self.assertEqual(visible_step.status_code, 200, visible_step.content)
        self.assertNotIn("accepted_answers", visible_step.json()["data"]["content"])
        wrong = self.client.post(scratch_path + "/submissions", '{"answer":"10"}', content_type="application/json")
        self.assertEqual(wrong.json()["data"]["status"], "incorrect")
        self.assertEqual(wrong.json()["data"]["feedback"], "Попробуйте ещё раз")
        correct = self.client.post(scratch_path + "/submissions", '{"answer":"20"}', content_type="application/json")
        self.assertEqual(correct.status_code, 201, correct.content)
        self.assertEqual(correct.json()["data"]["status"], "accepted")

        project_path = f"/api/v1/student/enrollments/{enrollment.pk}/steps/{project.pk}/submissions"
        sent = self.client.post(project_path, '{"url":"https://example.org/scratch/project"}',
                                content_type="application/json")
        self.assertEqual(sent.status_code, 201, sent.content)
        self.assertEqual(sent.json()["data"]["status"], "pending_review")
        self.client.force_login(self.curator)
        reviewed = self.client.post(f"/api/v1/curator/submissions/{sent.json()['data']['id']}/review",
                                    '{"decision":"accepted"}', content_type="application/json")
        self.assertEqual(reviewed.status_code, 200, reviewed.content)
        self.assertEqual(reviewed.json()["data"]["score"], 10)

    def test_scratch_hint_is_visible_only_after_incorrect_attempt(self):
        hint = "Мяч начинает с −200 и десять раз проходит по 20 шагов."
        content = {
            "prompt": "Где будет мяч?", "accepted_answers": ["0"],
            "feedback_after_incorrect": hint,
        }
        course = Course.objects.create(title="Scratch hint", owner=self.admin)
        for position, (kind, title, body, score) in enumerate(DEMO_STEPS[:2], start=1):
            DraftStep.objects.create(course=course, type_key=kind, position=position,
                                     title=title, content=body, max_score=score)
        DraftStep.objects.create(course=course, type_key="scratch.numeric_answer", position=3,
                                 title="Мяч", content=content, max_score=1)
        revision = publish_course(course_id=course.pk, actor=self.admin)
        enrollment = Enrollment.objects.create(revision=revision, student=self.student, curator=self.curator)
        step = revision.steps.get(type_key="scratch.numeric_answer")
        path = f"/api/v1/student/enrollments/{enrollment.pk}/steps/{step.pk}"

        before = self.client.get(path)
        self.assertEqual(before.status_code, 200, before.content)
        self.assertNotIn(hint, str(before.json()))
        self.assertNotIn(hint, str(self.client.get(f"/api/v1/student/enrollments/{enrollment.pk}").json()))

        wrong = self.client.post(path + "/submissions", '{"answer":"1"}', content_type="application/json")
        self.assertEqual(wrong.status_code, 201, wrong.content)
        self.assertEqual(wrong.json()["data"]["status"], "incorrect")
        self.assertEqual(wrong.json()["data"]["feedback"], hint)
        history = self.client.get(path + "/submissions")
        self.assertEqual(history.json()["data"][0]["feedback"], hint)
        self.assertNotIn(hint, str(self.client.get(path).json()))

        correct = self.client.post(path + "/submissions", '{"answer":"0"}', content_type="application/json")
        self.assertEqual(correct.status_code, 201, correct.content)
        self.assertEqual(correct.json()["data"]["status"], "accepted")
        self.assertEqual(correct.json()["data"]["feedback"], "Верно")
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(path + "/submissions").status_code, 404)

    def test_scratch_hint_schema_rejects_empty_or_oversized_text(self):
        base = {"prompt": "Где мяч?", "accepted_answers": ["0"]}
        for invalid in ("", "  ", ["Не строка"], "x" * 5001):
            with self.subTest(invalid=repr(invalid)[:30]), self.assertRaises(ValidationError):
                validate_step_content("scratch.numeric_answer", 1, {
                    **base, "feedback_after_incorrect": invalid,
                })

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
            response = self.client.get(download)
            try:
                self.assertEqual(response.status_code, 200)
            finally:
                response.close()
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

    def test_project_requires_evidence_and_keeps_criteria_for_curator(self):
        course = Course.objects.create(title="Organizer project", owner=self.admin)
        for position, (kind, title, content, score) in enumerate(DEMO_STEPS[:2], start=1):
            DraftStep.objects.create(course=course, type_key=kind, position=position,
                                     title=title, content=content, max_score=score)
        DraftStep.objects.create(
            course=course, type_key="artifact.project", position=3, title="Проект мост",
            content={"instructions": "Пришлите снимок и ссылку", "required_evidence": ["file", "url"],
                     "review_criteria": "Агент построил мост"}, max_score=1,
        )
        revision = publish_course(course_id=course.pk, actor=self.admin)
        enrollment = Enrollment.objects.create(revision=revision, student=self.student, curator=self.curator)
        step = revision.steps.get(type_key="artifact.project")
        step_path = f"/api/v1/student/enrollments/{enrollment.pk}/steps/{step.pk}"
        self.assertNotIn("review_criteria", self.client.get(step_path).json()["data"]["content"])
        self.assertEqual(self.client.post(step_path + "/submissions", {
            "url": "https://example.org/makecode",
        }).status_code, 400)
        sent = self.client.post(step_path + "/submissions", {
            "file": SimpleUploadedFile("bridge.png", b"\x89PNG\r\n\x1a\n"),
            "url": "https://example.org/makecode",
        })
        self.assertEqual(sent.status_code, 201, sent.content)
        self.client.force_login(self.curator)
        detail = self.client.get(f"/api/v1/curator/submissions/{sent.json()['data']['id']}")
        self.assertEqual(detail.json()["data"]["step"]["content"]["review_criteria"], "Агент построил мост")

    def test_python_limits_rejected_before_publishing(self):
        content = dict(DEMO_STEPS[3][2], time_limit_ms=0)
        with self.assertRaises(ValidationError):
            validate_step_content("algorithm.python", 1, content)
        content = dict(DEMO_STEPS[3][2], tests=[{"input": "x" * (64 * 1024 + 1), "output": ""}])
        with self.assertRaises(ValidationError):
            validate_step_content("algorithm.python", 1, content)
