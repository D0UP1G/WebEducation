from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User
from apps.courses.models import Course, DraftStep
from apps.courses.services import publish_course
from apps.learning.models import Enrollment


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


class Command(BaseCommand):
    help = "Create idempotent synthetic demo users, course and enrollment"

    @transaction.atomic
    def handle(self, *args, **options):
        users = {}
        for username, display_name, role in (
            ("admin_demo", "Администратор Демо", User.Role.ADMIN),
            ("curator_demo", "Куратор Демо", User.Role.CURATOR),
            ("student_demo", "Ученик Демо", User.Role.STUDENT),
        ):
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"display_name": display_name, "role": role, "is_staff": role == User.Role.ADMIN},
            )
            user.display_name = display_name
            user.role = role
            user.is_staff = role == User.Role.ADMIN
            user.set_password("demo")
            user.save()
            users[role] = user

        course, _ = Course.objects.get_or_create(
            title="Синтетический курс: основы алгоритмов",
            owner=users[User.Role.ADMIN],
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
            revision = publish_course(course_id=course.id, actor=users[User.Role.ADMIN])
        else:
            revision = course.latest_revision
        Enrollment.objects.get_or_create(
            revision=revision,
            student=users[User.Role.STUDENT],
            defaults={"curator": users[User.Role.CURATOR]},
        )
        self.stdout.write(self.style.SUCCESS("Demo data are ready. Password for *_demo users: demo"))

