import uuid
from datetime import timedelta
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError as ApiValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.models import LoginAttempt
from apps.accounts.management.commands.seed_demo import DEMO_STEPS
from apps.courses.models import Course, DraftStep
from apps.courses.services import publish_course
from apps.learning.models import Enrollment


class CoreApiTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username="admin", password="pass", display_name="Admin", role=User.Role.ADMIN
        )
        cls.student = User.objects.create_user(
            username="student", password="pass", display_name="Student", role=User.Role.STUDENT
        )
        cls.other_student = User.objects.create_user(
            username="other", password="pass", display_name="Other", role=User.Role.STUDENT
        )
        cls.third_student = User.objects.create_user(
            username="third", password="pass", display_name="Third", role=User.Role.STUDENT
        )
        cls.curator = User.objects.create_user(
            username="curator", password="pass", display_name="Curator", role=User.Role.CURATOR
        )
        cls.course = Course.objects.create(title="Course", owner=cls.admin)
        for position, (type_key, title, content, max_score) in enumerate(DEMO_STEPS, start=1):
            DraftStep.objects.create(
                course=cls.course,
                type_key=type_key,
                position=position,
                title=title,
                content=content,
                max_score=max_score,
            )
        cls.revision = publish_course(course_id=cls.course.id, actor=cls.admin)
        cls.enrollment = Enrollment.objects.create(
            revision=cls.revision, student=cls.student, curator=cls.curator
        )

    def test_health_and_authentication(self):
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-Request-ID"], response.json()["meta"]["request_id"])
        self.client.force_login(self.student)
        response = self.client.get("/api/v1/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["role"], "student")

    def test_request_id_is_logged_and_only_safe_client_values_are_reused(self):
        supplied_id = "deploy-check-20260924"
        with self.assertLogs("webeducation.request", level="INFO") as logs:
            response = self.client.get("/api/v1/health", HTTP_X_REQUEST_ID=supplied_id)
        self.assertEqual(response["X-Request-ID"], supplied_id)
        self.assertEqual(response.json()["meta"]["request_id"], supplied_id)
        self.assertIn("request_completed method=GET path=/api/v1/health status=200", logs.output[0])

        response = self.client.get("/api/v1/health", HTTP_X_REQUEST_ID="bad\nrequest-id")
        self.assertNotEqual(response["X-Request-ID"], "bad\nrequest-id")
        self.assertEqual(response["X-Request-ID"], response.json()["meta"]["request_id"])

    def test_error_response_keeps_the_same_request_id_in_header_and_body(self):
        self.client.force_login(self.other_student)
        response = self.client.get(
            f"/api/v1/student/enrollments/{self.enrollment.id}",
            HTTP_X_REQUEST_ID="student-access-denied-1",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["X-Request-ID"], "student-access-denied-1")
        self.assertEqual(response.json()["meta"]["request_id"], "student-access-denied-1")

    def test_login_requires_csrf_and_returns_session_user(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.post("/api/v1/auth/login", {"username": "student", "password": "pass"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "csrf_failed")
        csrf_response = client.get("/api/v1/auth/csrf")
        token = csrf_response.json()["data"]["csrf_token"]
        response = client.post(
            "/api/v1/auth/login",
            {"username": "student", "password": "pass"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["role"], "student")

    def test_login_is_limited_by_ip_and_recovers_after_window(self):
        path = "/api/v1/auth/login"
        for number in range(5):
            response = self.client.post(path, {"username": f"unknown-{number}", "password": "wrong"})
            self.assertEqual(response.status_code, 400)
        blocked = self.client.post(path, {"username": "student", "password": "pass"})
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()["error"]["code"], "rate_limited")
        with patch("apps.accounts.login_throttle.timezone.now", return_value=timezone.now() + timedelta(minutes=16)):
            recovered = self.client.post(path, {"username": "student", "password": "pass"})
        self.assertEqual(recovered.status_code, 200, recovered.content)

    def test_login_is_limited_by_account_across_ips_and_does_not_enumerate_users(self):
        path = "/api/v1/auth/login"
        unknown = self.client.post(path, {"username": "absent", "password": "wrong"}, REMOTE_ADDR="192.0.2.11")
        existing = self.client.post(path, {"username": "student", "password": "wrong"}, REMOTE_ADDR="192.0.2.12")
        self.assertEqual(unknown.json()["error"], existing.json()["error"])
        for number in range(4):
            self.assertEqual(self.client.post(
                path, {"username": "student", "password": "wrong"}, REMOTE_ADDR=f"192.0.2.{number + 20}"
            ).status_code, 400)
        blocked = self.client.post(path, {"username": "student", "password": "pass"}, REMOTE_ADDR="192.0.2.99")
        self.assertEqual(blocked.status_code, 429)

    def test_prune_login_attempts_keeps_recent_counters(self):
        LoginAttempt.objects.create(key="a" * 64, failures=5, window_started_at=timezone.now() - timedelta(days=2))
        LoginAttempt.objects.create(key="b" * 64, failures=1, window_started_at=timezone.now())
        call_command("prune_login_attempts", verbosity=0)
        self.assertEqual(list(LoginAttempt.objects.values_list("key", flat=True)), ["b" * 64])

    def test_admin_can_create_students_and_curators_with_validated_passwords(self):
        path = "/api/v1/admin/users"
        payload = {
            "username": "new_student", "display_name": "Новый ученик", "role": "student",
            "password": "S3cure-Random-Password!2026",
        }
        self.client.force_login(self.student)
        self.assertEqual(self.client.post(path, payload).status_code, 403)

        self.client.force_login(self.admin)
        self.assertEqual(self.client.post(path, {**payload, "role": "admin"}).status_code, 400)
        self.assertEqual(self.client.post(path, {**payload, "password": "demo"}).status_code, 400)
        self.assertEqual(self.client.post(path, {**payload, "is_staff": True}).status_code, 400)
        response = self.client.post(path, payload)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["data"]["role"], "student")
        self.assertNotIn("password", response.json()["data"])
        self.assertNotIn("is_staff", response.json()["data"])
        created = User.objects.get(username="new_student")
        self.assertTrue(created.check_password(payload["password"]))
        self.assertFalse(created.is_staff)
        self.assertFalse(created.is_superuser)
        self.assertEqual(self.client.post(path, payload).status_code, 400)

        curator = self.client.post(path, {**payload, "username": "new_curator", "role": "curator"})
        self.assertEqual(curator.status_code, 201, curator.content)
        self.assertEqual(curator.json()["data"]["role"], "curator")

    def test_admin_can_deactivate_and_reactivate_user_without_leaking_inactive_options(self):
        self.client.force_login(self.admin)
        path = f"/api/v1/admin/users/{self.other_student.pk}"
        self.assertEqual(self.client.patch(path, {"role": "admin"}, content_type="application/json").status_code, 400)
        response = self.client.patch(path, '{"is_active":false}', content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.other_student.refresh_from_db()
        self.assertFalse(self.other_student.is_active)
        active = self.client.get("/api/v1/admin/users?role=student").json()["data"]
        self.assertNotIn(str(self.other_student.pk), [item["id"] for item in active])
        all_users = self.client.get("/api/v1/admin/users?role=student&include_inactive=1").json()["data"]
        self.assertIn(str(self.other_student.pk), [item["id"] for item in all_users])
        self.assertEqual(self.client.post("/api/v1/auth/login", {"username": "other", "password": "pass"}).status_code, 400)
        response = self.client.patch(path, '{"is_active":true}', content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.other_student.refresh_from_db()
        self.assertTrue(self.other_student.is_active)

    def test_admin_cannot_deactivate_curator_with_active_enrollments_or_an_admin(self):
        self.client.force_login(self.admin)
        curator_path = f"/api/v1/admin/users/{self.curator.pk}"
        response = self.client.patch(curator_path, '{"is_active":false}', content_type="application/json")
        self.assertEqual(response.status_code, 400, response.content)
        self.curator.refresh_from_db()
        self.assertTrue(self.curator.is_active)
        admin_path = f"/api/v1/admin/users/{self.admin.pk}"
        self.assertEqual(self.client.patch(admin_path, '{"is_active":false}', content_type="application/json").status_code, 404)

    def test_curator_students_calculates_progress_only_for_current_page(self):
        Enrollment.objects.create(revision=self.revision, student=self.other_student, curator=self.curator)
        Enrollment.objects.create(revision=self.revision, student=self.third_student, curator=self.curator)
        self.client.force_login(self.curator)
        with patch("apps.mentoring.views.build_progress", return_value={"completed_steps": 0}) as progress:
            response = self.client.get("/api/v1/curator/students?page_size=1&page=2")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["meta"]["total"], 3)
        self.assertEqual(len(response.json()["data"]), 1)
        self.assertEqual(progress.call_count, 1)

    def test_student_cannot_read_another_enrollment(self):
        self.client.force_login(self.other_student)
        response = self.client.get(f"/api/v1/student/enrollments/{self.enrollment.id}")
        self.assertEqual(response.status_code, 404)

    def test_student_payload_hides_answers_and_tests(self):
        self.client.force_login(self.student)
        response = self.client.get(f"/api/v1/student/enrollments/{self.enrollment.id}")
        self.assertEqual(response.status_code, 200)
        steps = response.json()["data"]["steps"]
        quiz = next(step for step in steps if step["type_key"] == "quiz.single_choice")
        python_step = next(step for step in steps if step["type_key"] == "algorithm.python")
        self.assertNotIn("correct_option_id", quiz["content"])
        self.assertNotIn("tests", python_step["content"])

    def test_published_revision_is_immutable_and_enrollment_stays_on_old_version(self):
        old_revision_id = self.enrollment.revision_id
        self.revision.title = "Changed"
        with self.assertRaises(ValidationError):
            self.revision.save()
        self.course.title = "Course v2"
        self.course.save()
        publish_course(course_id=self.course.id, actor=self.admin)
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.revision_id, old_revision_id)

    def test_publishing_requires_theory_and_control_question(self):
        minimal = Course.objects.create(title="Theory and question", owner=self.admin)
        DraftStep.objects.create(
            course=minimal, type_key="theory", position=1, title="Введение", content={"body": "Текст"}, max_score=5,
        )
        self.client.force_login(self.admin)
        path = f"/api/v1/admin/courses/{minimal.id}/publish"
        theory_only = self.client.post(path)
        self.assertEqual(theory_only.status_code, 400, theory_only.content)
        self.assertIn("контрольный вопрос", " ".join(theory_only.json()["error"]["fields"]["steps"]))
        self.assertEqual(minimal.revisions.count(), 0)

        DraftStep.objects.create(
            course=minimal, type_key="answer.exact", position=2, title="Точный ответ",
            content={"prompt": "Сколько будет 2 + 2?", "accepted_answers": ["4"]}, max_score=5,
        )
        self.assertEqual(self.client.post(path).status_code, 400)

        DraftStep.objects.create(
            course=minimal, type_key="quiz.single_choice", position=3, title="Контрольный вопрос",
            content=DEMO_STEPS[1][2], max_score=5,
        )
        published = self.client.post(path)
        self.assertEqual(published.status_code, 201, published.content)
        self.assertEqual(minimal.revisions.count(), 1)
        self.assertEqual(len(published.json()["data"]["steps"]), 3)

        no_theory = Course.objects.create(title="No theory", owner=self.admin)
        DraftStep.objects.create(
            course=no_theory, type_key="quiz.single_choice", position=1, title="Контрольный вопрос",
            content=DEMO_STEPS[1][2], max_score=5,
        )
        with self.assertRaises(ApiValidationError):
            publish_course(course_id=no_theory.id, actor=self.admin)

    def test_multiple_choice_satisfies_control_question_requirement(self):
        course = Course.objects.create(title="Multiple choice question", owner=self.admin)
        DraftStep.objects.create(
            course=course, type_key="theory", position=1, title="Введение",
            content={"body": "Текст"}, max_score=5,
        )
        DraftStep.objects.create(
            course=course, type_key="quiz.multiple_choice", position=2, title="Контрольный вопрос",
            content={
                "question": "Какие числа чётные?",
                "choices": [{"id": "a", "text": "2"}, {"id": "b", "text": "3"}, {"id": "c", "text": "4"}],
                "correct_option_ids": ["a", "c"],
            },
            max_score=5,
        )
        revision = publish_course(course_id=course.id, actor=self.admin)
        self.assertEqual(revision.steps.count(), 2)

    def test_admin_and_student_role_boundaries(self):
        self.client.force_login(self.student)
        self.assertEqual(self.client.get("/api/v1/admin/courses").status_code, 403)
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get("/api/v1/student/courses").status_code, 403)

    def test_admin_assigns_current_revision_and_rejects_duplicate_assignment(self):
        self.client.force_login(self.admin)
        types_response = self.client.get("/api/v1/admin/course-types")
        self.assertEqual(types_response.status_code, 200)
        self.assertEqual(
            {item["type_key"] for item in types_response.json()["data"]},
            {
                "theory", "quiz.single_choice", "quiz.multiple_choice", "answer.exact", "algorithm.python",
                "artifact.scratch", "artifact.minecraft",
            },
        )
        payload = {
            "course_id": str(self.course.id),
            "student_id": str(self.other_student.id),
            "curator_id": str(self.curator.id),
            "status": "active",
        }
        response = self.client.post(
            "/api/v1/admin/enrollments",
            payload,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["data"]["revision"]["id"], str(self.revision.id))

        duplicate = self.client.post("/api/v1/admin/enrollments", payload, content_type="application/json")
        self.assertEqual(duplicate.status_code, 409, duplicate.content)
        self.assertEqual(duplicate.json()["error"]["code"], "state_conflict")
        self.assertEqual(Enrollment.objects.filter(student=self.other_student).count(), 1)

        self.course.title = "Course v2"
        self.course.save()
        next_revision = publish_course(course_id=self.course.id, actor=self.admin)
        next_assignment = self.client.post(
            "/api/v1/admin/enrollments",
            {
                "course_id": str(self.course.id),
                "student_id": str(self.third_student.id),
                "curator_id": str(self.curator.id),
                "status": "active",
            },
            content_type="application/json",
        )
        self.assertEqual(next_assignment.status_code, 201, next_assignment.content)
        self.assertEqual(next_assignment.json()["data"]["revision"]["id"], str(next_revision.id))

    def test_admin_assignment_defaults_to_active_for_the_ui_payload(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/v1/admin/enrollments",
            {
                "course_id": str(self.course.id),
                "student_id": str(self.other_student.id),
                "curator_id": str(self.curator.id),
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["data"]["status"], Enrollment.Status.ACTIVE)

    def test_draft_steps_can_be_inserted_moved_and_removed_without_changing_published_order(self):
        self.client.force_login(self.admin)
        course_url = f"/api/v1/admin/courses/{self.course.id}"
        original_published_ids = list(self.revision.steps.order_by("position").values_list("id", flat=True))
        original_draft_ids = list(self.course.draft_steps.order_by("position").values_list("id", flat=True))

        created = self.client.post(
            f"{course_url}/steps",
            {
                "type_key": "theory", "schema_version": 1, "position": 2,
                "title": "Вставленный шаг", "content": {"body": "Дополнительная теория"}, "max_score": 2,
            },
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        inserted_id = created.json()["data"]["id"]
        self.assertEqual(
            list(self.course.draft_steps.order_by("position").values_list("id", flat=True)),
            [original_draft_ids[0], uuid.UUID(inserted_id), *original_draft_ids[1:]],
        )

        moved = self.client.patch(
            f"{course_url}/steps/{inserted_id}", {"position": 1}, content_type="application/json"
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        self.assertEqual(moved.json()["data"]["position"], 1)
        self.assertEqual(
            list(self.course.draft_steps.order_by("position").values_list("position", flat=True)),
            list(range(1, 8)),
        )

        rejected = self.client.patch(
            f"{course_url}/steps/{inserted_id}", {"position": 99}, content_type="application/json"
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(self.course.draft_steps.get(pk=inserted_id).position, 1)

        deleted = self.client.delete(f"{course_url}/steps/{inserted_id}")
        self.assertEqual(deleted.status_code, 200, deleted.content)
        self.assertEqual(
            list(self.course.draft_steps.order_by("position").values_list("id", flat=True)), original_draft_ids
        )
        self.assertEqual(
            list(self.revision.steps.order_by("position").values_list("id", flat=True)), original_published_ids
        )

        appended = self.client.post(
            f"{course_url}/steps",
            {
                "type_key": "theory", "schema_version": 1,
                "title": "Последний шаг", "content": {"body": "Теория в конце"}, "max_score": 2,
            },
            content_type="application/json",
        )
        self.assertEqual(appended.status_code, 201, appended.content)
        self.assertEqual(appended.json()["data"]["position"], 7)

        published = self.client.post(f"{course_url}/publish")
        self.assertEqual(published.status_code, 201, published.content)
        self.assertEqual([step["position"] for step in published.json()["data"]["steps"]], list(range(1, 8)))
        self.assertEqual(published.json()["data"]["steps"][-1]["title"], "Последний шаг")
