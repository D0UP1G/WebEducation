import uuid

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
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
        self.assertEqual(logs.records[0].request_id, supplied_id)
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

    def test_admin_and_student_role_boundaries(self):
        self.client.force_login(self.student)
        self.assertEqual(self.client.get("/api/v1/admin/courses").status_code, 403)
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get("/api/v1/student/courses").status_code, 403)

    def test_admin_assigns_current_revision_and_rejects_duplicate_assignment(self):
        self.client.force_login(self.admin)
        types_response = self.client.get("/api/v1/admin/course-types")
        self.assertEqual(types_response.status_code, 200)
        self.assertEqual(len(types_response.json()["data"]), 6)
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
