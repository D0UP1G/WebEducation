from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.test.utils import override_settings
import tempfile
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

    def test_rejects_wrong_type_extra_fields_and_foreign_access(self):
        self.assertEqual(self.post("theory", '{"answer":"x"}').status_code, 400)
        self.assertEqual(self.post("answer.exact", '{"answer":"101","score":5}').status_code, 400)
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

    def test_manual_url_queue_and_private_artifact(self):
        url_result = self.post("artifact.scratch", '{"url":"https://example.org/project.sb3"}')
        self.assertEqual(url_result.status_code, 201, url_result.content)
        self.assertEqual(url_result.json()["data"]["status"], "pending_review")
        self.assertEqual(self.post("artifact.scratch", '{"url":"https://example.org/again"}').status_code, 409)
        file_path = self.path("artifact.minecraft")
        upload = SimpleUploadedFile("program.exe", b"bad")
        bad = self.client.post(file_path, {"file": upload})
        self.assertEqual(bad.status_code, 400, bad.content)

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

    def test_python_limits_rejected_before_publishing(self):
        content = dict(DEMO_STEPS[3][2], time_limit_ms=0)
        with self.assertRaises(ValidationError):
            validate_step_content("algorithm.python", 1, content)
        content = dict(DEMO_STEPS[3][2], tests=[{"input": "x" * (64 * 1024 + 1), "output": ""}])
        with self.assertRaises(ValidationError):
            validate_step_content("algorithm.python", 1, content)
