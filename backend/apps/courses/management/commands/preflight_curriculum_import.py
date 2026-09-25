import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import ValidationError

from apps.courses.import_plan import (
    DEFAULT_MANIFEST,
    build_import_plan,
    import_plan_summary,
    load_curriculum_manifest,
)


class Command(BaseCommand):
    help = "Проверяет карту и готовит безопасный план импорта, не изменяя базу данных."

    def add_arguments(self, parser):
        parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
        parser.add_argument(
            "--skip-source-verification",
            action="store_true",
            help="Validate the bundled map without requiring the original DOCX (for runtime images).",
        )

    def handle(self, *args, **options):
        try:
            manifest = load_curriculum_manifest(
                path=Path(options["manifest"]),
                verify_source=not options["skip_source_verification"],
            )
            plan = build_import_plan(manifest)
        except (OSError, ValueError, ValidationError) as exc:
            raise CommandError(str(exc)) from exc

        summary = import_plan_summary(plan)
        self.stdout.write(json.dumps(summary, ensure_ascii=False, indent=2))
