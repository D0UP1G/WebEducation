from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User
from apps.courses.importer import import_curriculum
from apps.courses.models import Course
from apps.learning.models import Enrollment


DEMO_USERS = (
    ("admin_demo", "Администратор Демо", User.Role.ADMIN),
    ("curator_demo", "Куратор Демо", User.Role.CURATOR),
    ("student_demo", "Алиса Демонстрационная", User.Role.STUDENT),
)


class Command(BaseCommand):
    help = "Create demo users and enroll a student in the organizer curriculum"

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

        import_curriculum(owner=users["admin_demo"], publish=True)
        for imported_course in Course.objects.filter(source_id__isnull=False).select_related("latest_revision"):
            Enrollment.objects.get_or_create(
                revision=imported_course.latest_revision,
                student=users["student_demo"],
                defaults={"curator": users["curator_demo"]},
            )
        self.stdout.write(
            self.style.SUCCESS(
                "Organizer curriculum ready: 3 courses, 9 modules, 30 steps. "
                "One clean enrollment per course; demo account password: demo."
            )
        )
