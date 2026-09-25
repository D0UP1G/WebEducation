from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.testing_fixtures import DEMO_STEPS
from apps.courses.models import Course, DraftStep
from apps.courses.services import publish_course
from apps.learning.models import Enrollment, Review, StepQuestion, StepQuestionMessage, Submission
from .services import lag_signals


class MentoringApiTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username="mentor_admin", password="pass", role=User.Role.ADMIN)
        cls.student = User.objects.create_user(username="mentor_student", password="pass", role=User.Role.STUDENT)
        cls.curator = User.objects.create_user(username="mentor_curator", password="pass", role=User.Role.CURATOR)
        cls.other_curator = User.objects.create_user(username="mentor_other", password="pass", role=User.Role.CURATOR)
        course = Course.objects.create(title="Mentoring", owner=cls.admin)
        for position, (kind, title, content, score) in enumerate(DEMO_STEPS, start=1):
            DraftStep.objects.create(course=course, type_key=kind, position=position, title=title, content=content, max_score=score)
        revision = publish_course(course_id=course.id, actor=cls.admin)
        cls.enrollment = Enrollment.objects.create(revision=revision, student=cls.student, curator=cls.curator)
        cls.scratch = revision.steps.get(type_key="artifact.scratch")
        cls.theory = revision.steps.get(type_key="theory")

    def test_manual_review_rights_queue_and_progress(self):
        for previous in self.enrollment.revision.steps.filter(position__lt=self.scratch.position):
            Submission.objects.create(
                enrollment=self.enrollment, step=previous, student=self.student, attempt_number=1,
                status=Submission.Status.ACCEPTED, payload={}, score=previous.max_score,
            )
        self.client.force_login(self.student)
        path = f"/api/v1/student/enrollments/{self.enrollment.pk}/steps/{self.scratch.pk}/submissions"
        sent = self.client.post(path, '{"url":"https://example.org/work.sb3"}', content_type="application/json")
        self.assertEqual(sent.status_code, 201, sent.content)
        submission_id = sent.json()["data"]["id"]
        detail_path = f"/api/v1/curator/submissions/{submission_id}"
        self.client.force_login(self.other_curator)
        self.assertEqual(self.client.get(detail_path).status_code, 404)
        self.assertEqual(self.client.post(detail_path + "/review", '{"decision":"accepted","comment":"ok"}',
                                          content_type="application/json").status_code, 404)
        self.client.force_login(self.curator)
        queue = self.client.get("/api/v1/curator/reviews?status=pending_review")
        self.assertEqual(queue.status_code, 200)
        self.assertEqual(queue.json()["data"][0]["submission_id"], submission_id)
        detail = self.client.get(detail_path)
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(detail.json()["data"]["course_title"], "Mentoring")
        self.assertEqual(detail.json()["data"]["step"]["content"], self.scratch.content)
        self.assertEqual(self.client.post(detail_path + "/review", '{"decision":"returned","comment":""}',
                                          content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(detail_path + "/review", '{"decision":"returned"}',
                                          content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(detail_path + "/review", '{"decision":"accepted"}',
                                          content_type="application/json").status_code, 400)
        reviewed = self.client.post(detail_path + "/review", '{"decision":"accepted","comment":"Хорошая работа"}',
                                    content_type="application/json")
        self.assertEqual(reviewed.status_code, 200, reviewed.content)
        self.assertEqual(reviewed.json()["data"]["score"], 10)
        self.assertEqual(reviewed.json()["data"]["feedback"], "Хорошая работа")
        self.assertEqual(Review.objects.filter(submission_id=submission_id).count(), 1)
        self.assertEqual(self.client.post(detail_path + "/review", '{"decision":"accepted","comment":"ok"}',
                                          content_type="application/json").status_code, 409)
        progress = self.client.get(f"/api/v1/curator/students/{self.student.pk}/enrollments/{self.enrollment.pk}/progress")
        previous_points = sum(
            step.max_score for step in self.enrollment.revision.steps.filter(position__lt=self.scratch.position)
        )
        self.assertEqual(progress.json()["data"]["earned_points"], previous_points + self.scratch.max_score)

    def test_questions_are_persistent_two_way_conversations(self):
        path = f"/api/v1/student/enrollments/{self.enrollment.pk}/steps/{self.theory.pk}/questions"
        self.client.force_login(self.student)
        self.assertEqual(self.client.post(path, "null", content_type="application/json").status_code, 400)
        posted = self.client.post(path, '{"question":"Как решить?"}', content_type="application/json")
        self.assertEqual(posted.status_code, 201, posted.content)
        question_id = posted.json()["data"]["id"]
        self.assertEqual(posted.json()["data"]["messages"][0]["body"], "Как решить?")
        self.assertEqual(self.client.get(path).json()["data"][0]["id"], question_id)
        self.client.force_login(self.other_curator)
        self.assertEqual(self.client.get("/api/v1/curator/questions").json()["data"], [])
        answer_path = f"/api/v1/curator/questions/{question_id}/answer"
        self.assertEqual(self.client.post(answer_path, '{"answer":"Попробуйте"}', content_type="application/json").status_code, 404)
        self.client.force_login(self.curator)
        questions = self.client.get("/api/v1/curator/questions").json()["data"]
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["course_title"], "Mentoring")
        self.assertEqual(questions[0]["step"]["content"], self.theory.content)
        answered = self.client.post(answer_path, '{"answer":"Попробуйте"}', content_type="application/json")
        self.assertEqual(answered.status_code, 200, answered.content)
        self.assertEqual(len(answered.json()["data"]["messages"]), 2)
        self.assertEqual(self.client.post(answer_path, '{"answer":"Ещё"}', content_type="application/json").status_code, 200)
        self.assertEqual(StepQuestionMessage.objects.filter(question_id=question_id).count(), 3)
        self.assertEqual(StepQuestion.objects.get(pk=question_id).answered_by, self.curator)
        self.assertEqual(self.client.get("/api/v1/curator/questions?status=all").json()["meta"]["total"], 1)

        self.client.force_login(self.student)
        reply = self.client.post(f"/api/v1/student/questions/{question_id}/messages", '{"body":"Спасибо"}', content_type="application/json")
        self.assertEqual(reply.status_code, 201, reply.content)
        self.assertEqual(reply.json()["data"]["messages"][-1]["body"], "Спасибо")
        self.assertEqual(self.client.get(path).json()["data"][0]["messages"][-1]["body"], "Спасибо")

    def test_curator_step_context_does_not_reveal_answer_key(self):
        quiz = self.enrollment.revision.steps.get(type_key="quiz.single_choice")
        StepQuestion.objects.create(enrollment=self.enrollment, step=quiz, student=self.student, question="Почему?")
        self.client.force_login(self.curator)
        questions = self.client.get("/api/v1/curator/questions")
        self.assertEqual(questions.status_code, 200, questions.content)
        content = questions.json()["data"][0]["step"]["content"]
        self.assertEqual(content["question"], quiz.content["question"])
        self.assertEqual(content["choices"], quiz.content["choices"])
        self.assertNotIn("correct_option_id", content)

    def test_lag_signals_are_explainable(self):
        now = timezone.now()
        Enrollment.objects.filter(pk=self.enrollment.pk).update(assigned_at=now - timedelta(hours=73))
        self.enrollment.refresh_from_db()
        self.assertIn("no_credit_72h", {item["code"] for item in lag_signals(self.enrollment, now)})
        for attempt in (1, 2):
            Submission.objects.create(enrollment=self.enrollment, step=self.theory, student=self.student,
                                      attempt_number=attempt, status=Submission.Status.INCORRECT,
                                      score=0, payload={"action": "complete"})
        self.assertIn("two_incorrect_24h", {item["code"] for item in lag_signals(self.enrollment, now)})

    def test_late_manual_acceptance_resets_no_credit_clock(self):
        now = timezone.now()
        Enrollment.objects.filter(pk=self.enrollment.pk).update(assigned_at=now - timedelta(days=5))
        self.enrollment.refresh_from_db()
        submission = Submission.objects.create(
            enrollment=self.enrollment, step=self.scratch, student=self.student,
            attempt_number=1, status=Submission.Status.PENDING_REVIEW,
            payload={"url": "https://example.org/work.sb3"},
        )
        old_time = now - timedelta(hours=80)
        Submission.objects.filter(pk=submission.pk).update(created_at=old_time, updated_at=old_time)
        self.assertIn("no_credit_72h", {item["code"] for item in lag_signals(self.enrollment, now)})

        self.client.force_login(self.curator)
        reviewed = self.client.post(f"/api/v1/curator/submissions/{submission.pk}/review",
                                    '{"decision":"accepted","comment":"Засчитано"}', content_type="application/json")
        self.assertEqual(reviewed.status_code, 200, reviewed.content)
        submission.refresh_from_db()
        self.assertGreater(submission.updated_at, submission.created_at)
        self.assertNotIn("no_credit_72h", {item["code"] for item in lag_signals(self.enrollment, now)})
        later = lag_signals(self.enrollment, now + timedelta(hours=73))
        self.assertEqual(next(item["since"] for item in later if item["code"] == "no_credit_72h"),
                         submission.updated_at.isoformat())
