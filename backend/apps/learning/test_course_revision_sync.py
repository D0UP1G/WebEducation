from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course, DraftStep
from apps.courses.services import publish_course
from .models import Enrollment, Submission
from .services import build_progress


class CourseRevisionSyncTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="release_admin", password="pass", role=User.Role.ADMIN)
        self.student = User.objects.create_user(username="release_student", password="pass", role=User.Role.STUDENT)
        self.curator = User.objects.create_user(username="release_curator", password="pass", role=User.Role.CURATOR)
        self.course = Course.objects.create(title="Алгоритмика", owner=self.admin)
        self.theory = DraftStep.objects.create(
            course=self.course,
            source_id="lesson-theory",
            type_key="theory",
            position=1,
            title="Теория",
            content={"body": "## Старый материал\n\nТекст."},
            max_score=1,
        )
        self.quiz = DraftStep.objects.create(
            course=self.course,
            source_id="lesson-quiz",
            type_key="quiz.single_choice",
            position=2,
            title="Вопрос",
            content={
                "question": "2 + 2?",
                "choices": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}],
                "correct_option_id": "b",
            },
            max_score=1,
        )
        self.project = DraftStep.objects.create(
            course=self.course,
            source_id="lesson-project",
            type_key="answer.exact",
            position=3,
            title="Задание",
            content={"prompt": "Ответь: да или нет", "accepted_answers": ["да"]},
            max_score=1,
        )
        self.revision_v1 = publish_course(course_id=self.course.pk, actor=self.admin)
        self.enrollment = Enrollment.objects.create(
            revision=self.revision_v1,
            student=self.student,
            curator=self.curator,
        )
        self.old_steps = {step.source_id: step for step in self.revision_v1.steps.all()}

    def accept_old_step(self, source_id):
        step = self.old_steps[source_id]
        Submission.objects.create(
            enrollment=self.enrollment,
            step=step,
            student=self.student,
            attempt_number=1,
            status=Submission.Status.ACCEPTED,
            payload={"action": "complete"},
            score=step.max_score,
            feedback="Зачтено",
        )

    def test_publish_updates_students_and_preserves_only_unchanged_step_progress(self):
        for source_id in ("lesson-theory", "lesson-quiz", "lesson-project"):
            self.accept_old_step(source_id)
        self.enrollment.status = Enrollment.Status.COMPLETED
        self.enrollment.save(update_fields=("status",))

        self.theory.content = {"body": "## Новый материал\n\n**Обновлённая тема.**"}
        self.theory.save(update_fields=("content", "updated_at"))
        DraftStep.objects.create(
            course=self.course,
            source_id="lesson-extra",
            type_key="answer.exact",
            position=4,
            title="Новый вопрос",
            content={"prompt": "Что выучили?", "accepted_answers": ["основы"]},
            max_score=1,
        )

        revision_v2 = publish_course(course_id=self.course.pk, actor=self.admin)
        self.enrollment.refresh_from_db()

        self.assertEqual(self.enrollment.revision_id, revision_v2.pk)
        self.assertEqual(self.enrollment.status, Enrollment.Status.ACTIVE)
        progress = build_progress(self.enrollment)
        self.assertEqual(progress["completed_steps"], 2)
        self.assertEqual(progress["total_steps"], 4)
        self.assertEqual(
            [(row["title"], row["status"]) for row in progress["steps"]],
            [("Теория", "not_started"), ("Вопрос", "accepted"), ("Задание", "accepted"), ("Новый вопрос", "not_started")],
        )

        client = APIClient()
        client.force_authenticate(user=self.student)
        current_theory = revision_v2.steps.get(source_id="lesson-theory")
        response = client.get(f"/api/v1/student/enrollments/{self.enrollment.pk}/steps/{current_theory.pk}")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["content"]["body"], "## Новый материал\n\n**Обновлённая тема.**")

        changed_theory_history = client.get(
            f"/api/v1/student/enrollments/{self.enrollment.pk}/steps/{current_theory.pk}/submissions"
        )
        self.assertEqual(changed_theory_history.status_code, 200, changed_theory_history.content)
        self.assertEqual(len(changed_theory_history.json()["data"]), 1)
        self.assertEqual(changed_theory_history.json()["data"][0]["revision_version"], 1)
        self.assertEqual(changed_theory_history.json()["data"][0]["status"], Submission.Status.ACCEPTED)

        completed_theory = client.post(
            f"/api/v1/student/enrollments/{self.enrollment.pk}/steps/{current_theory.pk}/submissions",
            {"action": "complete"},
            format="json",
        )
        self.assertEqual(completed_theory.status_code, 201, completed_theory.content)

        current_quiz = revision_v2.steps.get(source_id="lesson-quiz")
        history = client.get(
            f"/api/v1/student/enrollments/{self.enrollment.pk}/steps/{current_quiz.pk}/submissions"
        )
        self.assertEqual(history.status_code, 200, history.content)
        self.assertEqual(len(history.json()["data"]), 1)
        self.assertEqual(history.json()["data"][0]["revision_version"], 1)

    def test_paused_enrollments_update_and_removed_enrollments_stay_removed(self):
        paused = User.objects.create_user(username="paused_student", password="pass", role=User.Role.STUDENT)
        removed = User.objects.create_user(username="removed_student", password="pass", role=User.Role.STUDENT)
        paused_enrollment = Enrollment.objects.create(
            revision=self.revision_v1, student=paused, curator=self.curator, status=Enrollment.Status.PAUSED,
        )
        removed_enrollment = Enrollment.objects.create(
            revision=self.revision_v1, student=removed, curator=self.curator, status=Enrollment.Status.REMOVED,
        )
        self.course.title = "Алгоритмика · версия 2"
        self.course.save(update_fields=("title", "updated_at"))

        revision_v2 = publish_course(course_id=self.course.pk, actor=self.admin)
        paused_enrollment.refresh_from_db()
        removed_enrollment.refresh_from_db()

        self.assertEqual(paused_enrollment.revision_id, revision_v2.pk)
        self.assertEqual(paused_enrollment.status, Enrollment.Status.PAUSED)
        self.assertEqual(removed_enrollment.revision_id, self.revision_v1.pk)
        self.assertEqual(removed_enrollment.status, Enrollment.Status.REMOVED)

    def test_multiple_old_assignments_collapse_to_one_current_assignment_with_history(self):
        self.accept_old_step("lesson-theory")
        revision_v2 = publish_course(course_id=self.course.pk, actor=self.admin)
        self.enrollment.refresh_from_db()
        duplicate = Enrollment.objects.create(
            revision=self.revision_v1,
            student=self.student,
            curator=self.curator,
        )
        old_quiz = self.old_steps["lesson-quiz"]
        Submission.objects.create(
            enrollment=duplicate,
            step=old_quiz,
            student=self.student,
            attempt_number=1,
            status=Submission.Status.ACCEPTED,
            payload={"answer": "b"},
            score=old_quiz.max_score,
            feedback="Зачтено",
        )

        revision_v3 = publish_course(course_id=self.course.pk, actor=self.admin)
        duplicate.refresh_from_db()
        self.enrollment.refresh_from_db()

        self.assertEqual(duplicate.revision_id, revision_v3.pk)
        self.assertEqual(self.enrollment.revision_id, revision_v2.pk)
        self.assertEqual(self.enrollment.status, Enrollment.Status.REMOVED)
        self.assertEqual(
            Enrollment.objects.filter(student=self.student, revision=revision_v3).count(),
            1,
        )
        self.assertEqual(Submission.objects.filter(enrollment=duplicate).count(), 2)
        self.assertEqual(build_progress(duplicate)["completed_steps"], 2)
