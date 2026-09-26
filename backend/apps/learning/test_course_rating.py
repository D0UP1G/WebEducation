from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course, DraftStep
from apps.courses.services import publish_course
from .models import Enrollment, Submission


class CourseRatingTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="rating_admin", password="pass", role=User.Role.ADMIN)
        self.student = User.objects.create_user(
            username="rating_student", password="pass", role=User.Role.STUDENT, display_name="Ученик А"
        )
        self.top_student = User.objects.create_user(
            username="rating_top", password="pass", role=User.Role.STUDENT, display_name="Ученик Б"
        )
        self.tie_student = User.objects.create_user(
            username="rating_tie", password="pass", role=User.Role.STUDENT, display_name="Ученик В"
        )
        self.other_student = User.objects.create_user(
            username="rating_other", password="pass", role=User.Role.STUDENT, display_name="Другой курс"
        )
        self.curator = User.objects.create_user(username="rating_curator", password="pass", role=User.Role.CURATOR)
        self.course = Course.objects.create(title="Курс для рейтинга", owner=self.admin)
        self.theory = DraftStep.objects.create(
            course=self.course,
            source_id="rating-theory",
            type_key="theory",
            position=1,
            title="Теория",
            content={"body": "Прочитай материал."},
            max_score=1,
        )
        self.quiz = DraftStep.objects.create(
            course=self.course,
            source_id="rating-quiz",
            type_key="quiz.single_choice",
            position=2,
            title="Проверочный вопрос",
            content={
                "question": "2 + 2?",
                "choices": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}],
                "correct_option_id": "b",
            },
            max_score=2,
        )
        self.project = DraftStep.objects.create(
            course=self.course,
            source_id="rating-project",
            type_key="answer.exact",
            position=3,
            title="Практика",
            content={"prompt": "Ответь: да или нет", "accepted_answers": ["да"]},
            max_score=5,
        )
        self.revision = publish_course(course_id=self.course.pk, actor=self.admin)
        self.enrollment = self.make_enrollment(self.student)
        self.top_enrollment = self.make_enrollment(self.top_student)
        self.tie_enrollment = self.make_enrollment(self.tie_student)
        self.other_course = Course.objects.create(title="Другой курс", owner=self.admin)
        self.other_course.draft_steps.create(
            source_id="other-theory",
            type_key="theory",
            position=1,
            title="Теория",
            content={"body": "Материал."},
            max_score=1,
        )
        self.other_course.draft_steps.create(
            source_id="other-quiz",
            type_key="quiz.single_choice",
            position=2,
            title="Вопрос",
            content={
                "question": "1 + 1?",
                "choices": [{"id": "2", "text": "2"}, {"id": "3", "text": "3"}],
                "correct_option_id": "2",
            },
            max_score=1,
        )
        other_revision = publish_course(course_id=self.other_course.pk, actor=self.admin)
        self.make_enrollment(self.other_student, revision=other_revision)

    def make_enrollment(self, student, revision=None):
        return Enrollment.objects.create(
            revision=revision or self.revision,
            student=student,
            curator=self.curator,
        )

    def add_submission(self, *, enrollment, step, attempt, status):
        return Submission.objects.create(
            enrollment=enrollment,
            step=step,
            student=enrollment.student,
            attempt_number=attempt,
            status=status,
            payload={"attempt": attempt},
        )

    def test_rating_rewards_first_solve_and_penalizes_only_failed_attempts_before_it(self):
        steps = {step.source_id: step for step in self.revision.steps.all()}
        self.add_submission(
            enrollment=self.enrollment,
            step=steps["rating-theory"],
            attempt=1,
            status=Submission.Status.ACCEPTED,
        )
        for attempt in (1, 2):
            self.add_submission(
                enrollment=self.enrollment,
                step=steps["rating-quiz"],
                attempt=attempt,
                status=Submission.Status.INCORRECT,
            )
        self.add_submission(
            enrollment=self.enrollment,
            step=steps["rating-quiz"],
            attempt=3,
            status=Submission.Status.ACCEPTED,
        )
        self.add_submission(
            enrollment=self.enrollment,
            step=steps["rating-quiz"],
            attempt=4,
            status=Submission.Status.INCORRECT,
        )
        self.add_submission(
            enrollment=self.enrollment,
            step=steps["rating-project"],
            attempt=1,
            status=Submission.Status.RETURNED,
        )
        self.add_submission(
            enrollment=self.enrollment,
            step=steps["rating-project"],
            attempt=2,
            status=Submission.Status.ERROR,
        )

        client = APIClient()
        client.force_authenticate(user=self.student)
        response = client.get(f"/api/v1/student/enrollments/{self.enrollment.pk}/rating")

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertEqual(data["rating"], 170)  # +200, -20, -10; theory, error and post-solve retry are ignored
        self.assertEqual(data["total_changes"], 4)
        self.assertEqual([change["delta"] for change in data["recent_changes"]], [-10, 200, -10, -10])
        self.assertEqual(data["recent_changes"][0]["reason"], "Неверная попытка до зачёта")

    def test_leaderboard_is_limited_to_the_same_course_revision_and_reports_my_place(self):
        quiz = self.revision.steps.get(source_id="rating-quiz")
        self.add_submission(
            enrollment=self.top_enrollment,
            step=quiz,
            attempt=1,
            status=Submission.Status.ACCEPTED,
        )
        self.add_submission(
            enrollment=self.tie_enrollment,
            step=quiz,
            attempt=1,
            status=Submission.Status.ACCEPTED,
        )

        client = APIClient()
        client.force_authenticate(user=self.student)
        response = client.get(f"/api/v1/student/enrollments/{self.enrollment.pk}/rating")

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertEqual(data["place"], 3)
        self.assertEqual(data["participant_count"], 3)
        self.assertEqual(data["top"][0]["display_name"], "Ученик Б")
        self.assertEqual(data["top"][0]["rating"], 200)
        self.assertEqual(data["top"][0]["place"], 1)
        self.assertEqual(data["top"][1]["place"], 1)
        self.assertEqual(data["top"][2]["place"], 3)
        self.assertTrue(data["top"][2]["is_current_user"])

    def test_students_cannot_read_an_unassigned_course_rating(self):
        client = APIClient()
        client.force_authenticate(user=self.other_student)

        response = client.get(f"/api/v1/student/enrollments/{self.enrollment.pk}/rating")

        self.assertEqual(response.status_code, 404)
