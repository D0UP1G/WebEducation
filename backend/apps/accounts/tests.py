from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.accounts.models import User
from apps.courses.models import Course, DraftStep, Module
from apps.learning.models import Enrollment, Review, StepQuestion, Submission
from apps.learning.serializers import StudentEnrollmentSerializer


class SeedDemoTests(TestCase):
    def test_seed_demo_uses_only_the_official_curriculum_and_starts_clean(self):
        call_command("seed_demo", stdout=StringIO())

        self.assertEqual(
            set(Course.objects.values_list("source_id", flat=True)),
            {"organizer-course-1", "organizer-course-2", "organizer-course-3"},
        )
        self.assertEqual(Course.objects.count(), 3)
        self.assertEqual(Module.objects.count(), 9)
        self.assertEqual(DraftStep.objects.count(), 30)
        self.assertEqual(Enrollment.objects.count(), 3)
        self.assertEqual(Submission.objects.count(), 0)
        self.assertEqual(Review.objects.count(), 0)
        self.assertEqual(StepQuestion.objects.count(), 0)
        self.assertEqual(User.objects.count(), 3)

        enrollment = Enrollment.objects.select_related("revision").first()
        data = StudentEnrollmentSerializer(enrollment).data
        self.assertTrue(data["tool"])
        self.assertTrue(data["goal"])
        self.assertTrue(data["volume"])
        self.assertEqual(data["grade_min"], enrollment.revision.grade_min)
        self.assertEqual(data["grade_max"], enrollment.revision.grade_max)
        self.assertTrue(data["modules"])

        call_command("seed_demo", stdout=StringIO())

        self.assertEqual(Course.objects.count(), 3)
        self.assertEqual(Module.objects.count(), 9)
        self.assertEqual(DraftStep.objects.count(), 30)
        self.assertEqual(Enrollment.objects.count(), 3)
