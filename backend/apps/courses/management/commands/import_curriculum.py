from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.courses.import_plan import DEFAULT_MANIFEST
from apps.courses.importer import import_curriculum


class Command(BaseCommand):
    help = "Импортировать каноническую карту курсов в черновики и при необходимости опубликовать"

    def add_arguments(self, parser):
        parser.add_argument("--owner", default="admin_demo", help="Логин владельца импортированных курсов")
        parser.add_argument(
            "--manifest",
            type=Path,
            default=DEFAULT_MANIFEST,
            help="Путь к curriculum-map.json",
        )
        parser.add_argument("--publish", action="store_true", help="Опубликовать новые или изменённые ревизии")

    def handle(self, *args, **options):
        try:
            owner = User.objects.get(username=options["owner"], role=User.Role.ADMIN)
        except User.DoesNotExist as exc:
            raise CommandError(f"Администратор {options['owner']} не найден") from exc

        try:
            summary = import_curriculum(
                owner=owner,
                manifest_path=options["manifest"],
                publish=options["publish"],
            )
        except (OSError, ValueError) as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS("Импорт карты курсов завершён"))
        for key, value in summary.items():
            self.stdout.write(f"{key}: {value}")
