from base64 import b64decode
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.test.utils import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.testing_fixtures import DEMO_STEPS
from apps.courses.models import Course, DraftStep
from apps.courses.services import publish_course
from apps.learning.models import Enrollment


class AdminUserAndAssignmentWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username="workflow_admin", password="admin-pass", role=User.Role.ADMIN)
        cls.curator = User.objects.create_user(username="workflow_curator", password="curator-pass", role=User.Role.CURATOR, display_name="Куратор")
        cls.course = Course.objects.create(title="Опубликованный курс", owner=cls.admin)
        for position, (kind, title, content, score) in enumerate(DEMO_STEPS[:2], start=1):
            DraftStep.objects.create(course=cls.course, type_key=kind, position=position, title=title,
                                     content=content, max_score=score)
        publish_course(course_id=cls.course.pk, actor=cls.admin)
        cls.course.refresh_from_db()

    def setUp(self):
        self.client.force_login(self.admin)

    def test_admin_creates_passwordless_student_sets_password_and_assigns_course(self):
        created = self.client.post("/api/v1/admin/users", {
            "username": "new-learner", "display_name": "Новый ученик", "role": "student",
        }, content_type="application/json")
        self.assertEqual(created.status_code, 201, created.content)
        data = created.json()["data"]
        self.assertIn("setup_url", data)
        student = User.objects.get(pk=data["id"])
        self.assertFalse(student.has_usable_password())

        _, uid, token = data["setup_url"].strip("/").split("/")
        password = "Cobalt-Winter-Bridge!984"
        set_password = self.client.post("/api/v1/auth/set-password", {
            "uid": uid, "token": token, "password": password,
        }, content_type="application/json")
        self.assertEqual(set_password.status_code, 200, set_password.content)
        student.refresh_from_db()
        self.assertTrue(student.check_password(password))
        self.assertEqual(self.client.post("/api/v1/auth/set-password", {
            "uid": uid, "token": token, "password": "Another-Strong-Password!92",
        }, content_type="application/json").status_code, 400)

        assigned = self.client.post("/api/v1/admin/enrollments", {
            "course_id": str(self.course.pk), "student_id": str(student.pk),
            "curator_id": str(self.curator.pk), "status": "active",
        }, content_type="application/json")
        self.assertEqual(assigned.status_code, 201, assigned.content)
        self.assertEqual(Enrollment.objects.filter(student=student).count(), 1)

    def test_removed_assignment_preserves_history_and_can_be_reactivated(self):
        student = User.objects.create_user(username="existing-learner", password="pass", role=User.Role.STUDENT,
                                           display_name="Ученик")
        enrollment = Enrollment.objects.create(revision=self.course.latest_revision, student=student, curator=self.curator)
        response = self.client.patch(f"/api/v1/admin/enrollments/{enrollment.pk}", '{"status":"removed"}',
                                     content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.status, Enrollment.Status.REMOVED)
        self.assertEqual(Enrollment.objects.filter(pk=enrollment.pk).count(), 1)

        reassign = self.client.post("/api/v1/admin/enrollments", {
            "course_id": str(self.course.pk), "student_id": str(student.pk),
            "curator_id": str(self.curator.pk), "status": "active",
        }, content_type="application/json")
        self.assertEqual(reassign.status_code, 201, reassign.content)
        self.assertEqual(reassign.json()["data"]["id"], str(enrollment.pk))
        self.assertEqual(Enrollment.objects.filter(student=student).count(), 1)

    def test_delete_user_anonymizes_without_cascading_learning_history(self):
        student = User.objects.create_user(username="remove-learner", password="pass", role=User.Role.STUDENT,
                                           display_name="Пользователь")
        enrollment = Enrollment.objects.create(revision=self.course.latest_revision, student=student, curator=self.curator)
        response = self.client.delete(f"/api/v1/admin/users/{student.pk}")
        self.assertEqual(response.status_code, 200, response.content)
        student.refresh_from_db()
        self.assertTrue(student.is_deleted)
        self.assertFalse(student.is_active)
        self.assertEqual(student.display_name, "Удалённый пользователь")
        self.assertEqual(Enrollment.objects.get(pk=enrollment.pk).student_id, student.pk)

    def test_published_course_delete_archives_and_keeps_enrollment(self):
        student = User.objects.create_user(username="archive-learner", password="pass", role=User.Role.STUDENT,
                                           display_name="Ученик")
        enrollment = Enrollment.objects.create(revision=self.course.latest_revision, student=student, curator=self.curator)
        response = self.client.delete(f"/api/v1/admin/courses/{self.course.pk}")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"], {"deleted": False, "archived": True})
        self.course.refresh_from_db()
        self.assertTrue(self.course.is_archived)
        self.assertEqual(Enrollment.objects.get(pk=enrollment.pk).revision_id, self.course.latest_revision_id)

    def test_course_banner_is_validated_and_copied_into_immutable_revisions(self):
        png = b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmAAAAABJRU5ErkJggg==")
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            client = APIClient()
            client.force_authenticate(user=self.admin)
            banner = SimpleUploadedFile("cover.png", png, content_type="image/png")
            response = client.patch(
                f"/api/v1/admin/courses/{self.course.pk}", {"banner_image": banner},
                format="multipart",
            )
            self.assertEqual(response.status_code, 200, response.content)
            self.assertTrue(response.json()["data"]["banner_url"].startswith("/media/course-banners/"))

            published = client.post(f"/api/v1/admin/courses/{self.course.pk}/publish")
            self.assertEqual(published.status_code, 201, published.content)
            original_banner = published.json()["data"]["banner_url"]

            replacement = SimpleUploadedFile("cover.png", png + b"new", content_type="image/png")
            update = client.patch(
                f"/api/v1/admin/courses/{self.course.pk}", {"banner_image": replacement},
                format="multipart",
            )
            self.assertEqual(update.status_code, 200, update.content)
            next_revision = client.post(f"/api/v1/admin/courses/{self.course.pk}/publish")
            self.assertEqual(next_revision.status_code, 201, next_revision.content)
            self.assertEqual(
                self.course.revisions.get(version=2).banner_image.url,
                original_banner,
            )
            self.assertNotEqual(next_revision.json()["data"]["banner_url"], original_banner)

            invalid = SimpleUploadedFile("broken.png", b"not a PNG", content_type="image/png")
            rejected = client.patch(
                f"/api/v1/admin/courses/{self.course.pk}", {"banner_image": invalid},
                format="multipart",
            )
            self.assertEqual(rejected.status_code, 400)
