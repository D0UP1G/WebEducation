"""Synthetic API acceptance path for the DEV-4 handoff.

The imported organizer courses and official server-side Python grading need their
separate dependencies before this can become the full release acceptance test.
"""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User


class Dev4ApiAcceptanceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username="dev4_admin", password="synthetic", display_name="Admin", role=User.Role.ADMIN
        )
        cls.student = User.objects.create_user(
            username="dev4_student", password="synthetic", display_name="Student", role=User.Role.STUDENT
        )
        cls.curator = User.objects.create_user(
            username="dev4_curator", password="synthetic", display_name="Curator", role=User.Role.CURATOR
        )
        cls.other_curator = User.objects.create_user(
            username="dev4_other_curator", password="synthetic", display_name="Other curator",
            role=User.Role.CURATOR,
        )
        cls.other_student = User.objects.create_user(
            username="dev4_other", password="synthetic", display_name="Other", role=User.Role.STUDENT
        )

    def setUp(self):
        self.api = APIClient()
        self.request_number = 0

    def call(self, actor, method, path, expected_status, payload=None):
        self.api.force_login(actor)
        self.request_number += 1
        request_id = f"dev4-local-{self.request_number:02d}"
        with self.assertLogs("webeducation.request", level="INFO") as captured:
            response = getattr(self.api, method)(
                path, payload, format="json", HTTP_X_REQUEST_ID=request_id
            )
        self.assertEqual(response.status_code, expected_status, f"{method.upper()} {path}")
        self.assertEqual(response["X-Request-ID"], request_id)
        self.assertEqual(response.json()["meta"]["request_id"], request_id)
        self.assertTrue(
            any(
                getattr(record, "request_id", None) == request_id
                and f"path={path}" in record.getMessage()
                and f"status={expected_status}" in record.getMessage()
                for record in captured.records
            ),
            f"Нет коррелированной записи API для {request_id}",
        )
        return response.json()["data"] if expected_status < 400 else response.json()["error"]

    def test_publish_assign_review_progress_and_revision_pinning(self):
        course = self.call(
            self.admin, "post", "/api/v1/admin/courses", 201,
            {"title": "Синтетический курс DEV-4", "grade_min": 5, "grade_max": 9},
        )
        course_path = f"/api/v1/admin/courses/{course['id']}"
        steps = [
            ("theory", "Теория", {"body": "Последовательность действий называется алгоритмом."}),
            ("quiz.single_choice", "Один вариант", {
                "question": "Сколько будет два плюс два?",
                "choices": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}],
                "correct_option_id": "b",
            }),
            ("quiz.multiple_choice", "Несколько вариантов", {
                "question": "Выбери чётные числа",
                "choices": [
                    {"id": "a", "text": "2"}, {"id": "b", "text": "3"}, {"id": "c", "text": "4"},
                ],
                "correct_option_ids": ["a", "c"],
            }),
            ("scratch.numeric_answer", "Ответ Scratch", {
                "prompt": "Сколько шагов сделал спрайт?", "accepted_answers": ["12"],
            }),
            ("artifact.project", "Проект", {"instructions": "Пришли ссылку на работу."}),
        ]
        for type_key, title, content in steps:
            self.call(
                self.admin, "post", course_path + "/steps", 201,
                {"type_key": type_key, "title": title, "content": content, "max_score": 1},
            )
        published = self.call(self.admin, "post", course_path + "/publish", 201)
        self.assertEqual(published["version"], 1)
        assigned = self.call(
            self.admin, "post", "/api/v1/admin/enrollments", 201,
            {"course_id": course["id"], "student_id": str(self.student.id),
             "curator_id": str(self.curator.id)},
        )
        enrollment_path = f"/api/v1/student/enrollments/{assigned['id']}"
        visible = self.call(self.student, "get", enrollment_path, 200)
        self.assertEqual(visible["course_revision_id"], published["id"])
        self.assertEqual(visible["version"], 1)
        self.assertEqual(len(visible["steps"]), 5)
        step_ids = {step["type_key"]: step["id"] for step in visible["steps"]}
        hidden_fields = {
            "quiz.single_choice": "correct_option_id",
            "quiz.multiple_choice": "correct_option_ids",
            "scratch.numeric_answer": "accepted_answers",
        }
        for step in visible["steps"]:
            if step["type_key"] in hidden_fields:
                self.assertNotIn(hidden_fields[step["type_key"]], step["content"])

        def submission_path(type_key):
            return f"{enrollment_path}/steps/{step_ids[type_key]}/submissions"

        theory = self.call(self.student, "post", submission_path("theory"), 201, {"action": "complete"})
        self.assertEqual(theory["status"], "accepted")
        wrong = self.call(self.student, "post", submission_path("quiz.single_choice"), 201, {"answer": "a"})
        self.assertEqual(wrong["status"], "incorrect")
        correct = self.call(self.student, "post", submission_path("quiz.single_choice"), 201, {"answer": "b"})
        self.assertEqual((correct["status"], correct["attempt_number"]), ("accepted", 2))
        self.assertEqual(
            self.call(self.student, "post", submission_path("quiz.multiple_choice"), 201,
                      {"answer": ["a", "c"]})["status"],
            "accepted",
        )
        self.assertEqual(
            self.call(self.student, "post", submission_path("scratch.numeric_answer"), 201,
                      {"answer": "12"})["status"],
            "accepted",
        )
        first_project = self.call(
            self.student, "post", submission_path("artifact.project"), 201,
            {"url": "https://example.org/synthetic/project-v1"},
        )
        self.assertEqual(first_project["status"], "pending_review")
        queue = self.call(self.curator, "get", "/api/v1/curator/reviews", 200)
        self.assertIn(first_project["id"], {item["id"] for item in queue})
        returned = self.call(
            self.curator, "post", f"/api/v1/curator/submissions/{first_project['id']}/review", 200,
            {"decision": "returned", "comment": "Добавь пояснение."},
        )
        self.assertEqual(returned["status"], "returned")
        self.assertEqual(
            self.call(self.student, "get", f"/api/v1/student/submissions/{first_project['id']}", 200)["status"],
            "returned",
        )
        revised_project = self.call(
            self.student, "post", submission_path("artifact.project"), 201,
            {"url": "https://example.org/synthetic/project-v2", "explanation": "Добавлено пояснение."},
        )
        self.assertEqual(revised_project["attempt_number"], 2)
        accepted = self.call(
            self.curator, "post", f"/api/v1/curator/submissions/{revised_project['id']}/review", 200,
            {"decision": "accepted"},
        )
        self.assertEqual((accepted["status"], accepted["score"]), ("accepted", 1))
        progress = self.call(self.student, "get", enrollment_path + "/progress", 200)
        self.assertEqual(
            (progress["completed_steps"], progress["total_steps"],
             progress["earned_points"], progress["available_points"]),
            (5, 5, 5, 5),
        )
        self.assertEqual((progress["completion_percent"], progress["rating_percent"]), (100, 100))
        curator_progress = self.call(
            self.curator, "get",
            f"/api/v1/curator/students/{self.student.id}/enrollments/{assigned['id']}/progress", 200,
        )
        self.assertEqual(curator_progress["earned_points"], 5)

        self.call(self.admin, "patch", course_path, 200, {"title": "Синтетический курс DEV-4 v2"})
        next_revision = self.call(self.admin, "post", course_path + "/publish", 201)
        self.assertEqual(next_revision["version"], 2)
        old_assignment = self.call(self.student, "get", enrollment_path, 200)
        self.assertEqual(old_assignment["course_revision_id"], published["id"])
        self.assertEqual(old_assignment["title"], "Синтетический курс DEV-4")
        self.assertEqual(old_assignment["progress"]["earned_points"], 5)
        self.call(self.other_student, "get", enrollment_path, 404)
        self.call(self.other_curator, "get", f"/api/v1/curator/submissions/{revised_project['id']}", 404)
        self.assertEqual(self.request_number, 27)
