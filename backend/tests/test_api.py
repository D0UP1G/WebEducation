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
        self.client.force_login(self.student)
        response = self.client.get("/api/v1/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["role"], "student")

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

    def test_admin_can_list_types_and_assign_latest_revision(self):
        self.client.force_login(self.admin)
        types_response = self.client.get("/api/v1/admin/course-types")
        self.assertEqual(types_response.status_code, 200)
        self.assertEqual(len(types_response.json()["data"]), 6)
        response = self.client.post(
            "/api/v1/admin/enrollments",
            {
                "course_id": str(self.course.id),
                "student_id": str(self.other_student.id),
                "curator_id": str(self.curator.id),
                "status": "active",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["data"]["revision"]["id"], str(self.revision.id))
