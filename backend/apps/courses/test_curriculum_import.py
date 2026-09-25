import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.db.models import Sum
from django.test import TestCase

from apps.accounts.models import User
from apps.courses.importer import import_curriculum
from apps.courses.models import Course, DraftStep, Module, ModuleRevision
from apps.courses.serializers import CourseRevisionSerializer


class CurriculumImportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            username="curriculum_admin",
            password="demo",
            display_name="Администратор импорта",
            role=User.Role.ADMIN,
        )

    def test_import_creates_three_courses_nine_modules_and_thirty_steps(self):
        summary = import_curriculum(owner=self.owner)

        self.assertEqual(summary["courses"], 3)
        self.assertEqual(summary["modules"], 9)
        self.assertEqual(summary["steps"], 30)
        self.assertEqual(summary["total_max_score"], 30)
        self.assertEqual(Course.objects.filter(source_id__isnull=False).count(), 3)
        self.assertEqual(Module.objects.count(), 9)
        self.assertEqual(DraftStep.objects.filter(source_id__isnull=False).count(), 30)
        imported_courses = Course.objects.filter(source_id__isnull=False)
        self.assertEqual(
            set(imported_courses.values_list("source_id", flat=True)),
            {"organizer-course-1", "organizer-course-2", "organizer-course-3"},
        )
        for course in imported_courses:
            self.assertTrue(course.tool)
            self.assertTrue(course.goal)
            self.assertTrue(course.volume)

    def test_runtime_import_uses_map_without_requiring_original_docx(self):
        from apps.courses.import_plan import DEFAULT_MANIFEST

        manifest = json.loads(DEFAULT_MANIFEST.read_text(encoding="utf-8"))
        manifest["source"]["path"] = "docs/organizer/not-in-runtime.docx"
        with TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "curriculum-map.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            summary = import_curriculum(owner=self.owner, manifest_path=manifest_path)

        self.assertEqual(summary["courses"], 3)
        self.assertEqual(summary["modules"], 9)
        self.assertEqual(summary["steps"], 30)

    def test_repeated_published_import_is_idempotent_and_keeps_module_grouping(self):
        first = import_curriculum(owner=self.owner, publish=True)
        second = import_curriculum(owner=self.owner, publish=True)

        self.assertEqual(first["published_courses"], 3)
        self.assertEqual(second["published_courses"], 0)
        self.assertEqual(Course.objects.filter(source_id__isnull=False).count(), 3)
        self.assertEqual(Module.objects.count(), 9)
        self.assertEqual(DraftStep.objects.filter(source_id__isnull=False).count(), 30)
        self.assertEqual(ModuleRevision.objects.count(), 9)
        self.assertEqual(sum(course.revisions.count() for course in Course.objects.filter(source_id__isnull=False)), 3)
        self.assertEqual(
            [
                course.latest_revision.steps.aggregate(total=Sum("max_score"))["total"]
                for course in Course.objects.filter(source_id__isnull=False).order_by("source_id")
            ],
            [10, 8, 12],
        )
        self.assertEqual(
            Course.objects.get(source_id="organizer-course-1").latest_revision.modules.get(source_id="1.1").steps.count(),
            3,
        )
        revision_data = CourseRevisionSerializer(
            Course.objects.get(source_id="organizer-course-1").latest_revision
        ).data
        self.assertEqual(len(revision_data["modules"]), 3)
        self.assertEqual(len(revision_data["modules"][0]["steps"]), 3)
        self.assertNotIn("review_criteria", revision_data["modules"][0]["steps"][0]["content"])

    def test_import_does_not_replace_user_created_course(self):
        custom = Course.objects.create(
            title="Мой курс",
            description="Не трогать",
            owner=self.owner,
            grade_min=5,
            grade_max=8,
        )

        import_curriculum(owner=self.owner)

        custom.refresh_from_db()
        self.assertEqual(custom.title, "Мой курс")
        self.assertEqual(custom.description, "Не трогать")
        self.assertIsNone(custom.source_id)
