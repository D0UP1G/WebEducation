from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User
from apps.courses.models import Course, DraftStep
from apps.courses.services import publish_course
from apps.learning.models import Enrollment, Review, StepQuestion, Submission


DEMO_STEPS = [
    ("theory", "Что такое алгоритм", {"body": "Алгоритм — точная последовательность действий."}, 5),
    (
        "quiz.single_choice",
        "Свойства алгоритма",
        {
            "question": "Какое свойство означает завершение за конечное число шагов?",
            "choices": [
                {"id": "a", "text": "Дискретность"},
                {"id": "b", "text": "Конечность"},
                {"id": "c", "text": "Массовость"},
            ],
            "correct_option_id": "b",
        },
        5,
    ),
    ("answer.exact", "Двоичная система", {"prompt": "Запишите 5 в двоичной системе", "accepted_answers": ["101"]}, 5),
    (
        "algorithm.python",
        "Сумма двух чисел",
        {
            "statement": "Прочитайте два целых числа и выведите их сумму.",
            "tests": [{"input": "2 3\n", "output": "5\n"}, {"input": "-4 7\n", "output": "3\n"}],
            "time_limit_ms": 1000,
            "memory_limit_mb": 128,
        },
        10,
    ),
    (
        "artifact.scratch",
        "Scratch: движение спрайта",
        {"instructions": "Создайте проект, где спрайт проходит квадрат, и приложите ссылку или файл."},
        10,
    ),
    (
        "artifact.minecraft",
        "Minecraft Education: мост",
        {"instructions": "Постройте мост по алгоритму и приложите снимок или файл мира."},
        10,
    ),
]


# These records are deliberately fictional.  They make every workspace useful
# immediately after a fresh install: the administrator has assignments to
# inspect, the curator has a review and a question, and students have different
# progress states to explore.
DEMO_USERS = (
    ("admin_demo", "Администратор Демо", User.Role.ADMIN),
    ("curator_demo", "Куратор Демо", User.Role.CURATOR),
    ("student_demo", "Алиса Демонстрационная", User.Role.STUDENT),
    ("student_review_demo", "Борис На Проверке", User.Role.STUDENT),
    ("student_returned_demo", "Вера На Доработке", User.Role.STUDENT),
)


def create_submission(*, enrollment, step, student, status, payload, score, feedback):
    """Create one stable demo attempt without changing a user's later work."""
    submission, _ = Submission.objects.get_or_create(
        enrollment=enrollment,
        step=step,
        attempt_number=1,
        defaults={
            "student": student,
            "status": status,
            "payload": payload,
            "score": score,
            "feedback": feedback,
        },
    )
    return submission


class Command(BaseCommand):
    help = "Create idempotent synthetic demo users, course and enrollment"

    @transaction.atomic
    def handle(self, *args, **options):
        users = {}
        for username, display_name, role in DEMO_USERS:
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"display_name": display_name, "role": role, "is_staff": role == User.Role.ADMIN},
            )
            user.display_name = display_name
            user.role = role
            user.is_staff = role == User.Role.ADMIN
            user.set_password("demo")
            user.save()
            users[username] = user

        course, _ = Course.objects.get_or_create(
            title="Синтетический курс: основы алгоритмов",
            owner=users["admin_demo"],
            defaults={"description": "Демонстрационный курс без персональных данных.", "grade_min": 5, "grade_max": 9},
        )
        if not course.draft_steps.exists():
            for position, (type_key, title, content, max_score) in enumerate(DEMO_STEPS, start=1):
                DraftStep.objects.create(
                    course=course,
                    type_key=type_key,
                    schema_version=1,
                    position=position,
                    title=title,
                    content=content,
                    max_score=max_score,
                )
        if course.latest_revision_id is None:
            revision = publish_course(course_id=course.id, actor=users["admin_demo"])
        else:
            revision = course.latest_revision

        enrollments = {}
        for username in ("student_demo", "student_review_demo", "student_returned_demo"):
            enrollment, _ = Enrollment.objects.get_or_create(
                revision=revision,
                student=users[username],
                defaults={"curator": users["curator_demo"]},
            )
            enrollments[username] = enrollment

        steps = {step.type_key: step for step in revision.steps.all()}
        student = users["student_demo"]
        create_submission(
            enrollment=enrollments["student_demo"], step=steps["theory"], student=student,
            status=Submission.Status.ACCEPTED, payload={"action": "complete"}, score=5,
            feedback="Теория изучена",
        )
        create_submission(
            enrollment=enrollments["student_demo"], step=steps["quiz.single_choice"], student=student,
            status=Submission.Status.ACCEPTED, payload={"answer": "b"}, score=5,
            feedback="Верно",
        )
        create_submission(
            enrollment=enrollments["student_demo"], step=steps["answer.exact"], student=student,
            status=Submission.Status.ACCEPTED, payload={"answer": "101"}, score=5,
            feedback="Верно",
        )
        create_submission(
            enrollment=enrollments["student_demo"], step=steps["algorithm.python"], student=student,
            status=Submission.Status.INCORRECT, payload={"code": "a, b = map(int, input().split())\nprint(a - b)"}, score=0,
            feedback="Тесты не пройдены",
        )

        review_student = users["student_review_demo"]
        create_submission(
            enrollment=enrollments["student_review_demo"], step=steps["artifact.scratch"], student=review_student,
            status=Submission.Status.PENDING_REVIEW,
            payload={"url": "https://scratch.mit.edu/projects/123456789/"}, score=None,
            feedback="Ожидает проверки куратора",
        )
        StepQuestion.objects.get_or_create(
            enrollment=enrollments["student_review_demo"], step=steps["artifact.scratch"], student=review_student,
            question="Нужно ли прикладывать видео, если проект уже открыт по ссылке?",
        )

        returned_student = users["student_returned_demo"]
        returned = create_submission(
            enrollment=enrollments["student_returned_demo"], step=steps["artifact.minecraft"], student=returned_student,
            status=Submission.Status.RETURNED,
            payload={"url": "https://example.test/demo/minecraft-bridge"}, score=0,
            feedback="Добавьте снимок моста с двух сторон и отправьте работу повторно.",
        )
        Review.objects.get_or_create(
            submission=returned,
            defaults={
                "curator": users["curator_demo"],
                "decision": Review.Decision.RETURNED,
                "comment": returned.feedback,
            },
        )

        self.stdout.write(self.style.SUCCESS("Demo data are ready. Password for every *_demo user: demo"))
