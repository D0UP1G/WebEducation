from copy import deepcopy
from io import StringIO
import json

from django.core.management import call_command
from django.test import SimpleTestCase

from apps.courses.import_plan import (
    build_import_plan,
    import_plan_summary,
    load_curriculum_manifest,
)
from apps.courses.step_types import public_step_content


class CurriculumImportPlanTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.manifest = load_curriculum_manifest()
        cls.plan = build_import_plan(cls.manifest)
        cls.steps = {
            step.source_id: step
            for course in cls.plan
            for module in course.modules
            for step in module.steps
        }

    def test_plan_keeps_all_courses_modules_steps_and_approved_scores(self):
        self.assertEqual(
            import_plan_summary(self.plan),
            {
                "courses": 3,
                "modules": 9,
                "steps": 30,
                "steps_missing_score": 0,
                "total_max_score": 30,
                "manual_steps_with_criteria": 6,
            },
        )
        self.assertEqual(
            [sum(step.max_score for module in course.modules for step in module.steps) for course in self.plan],
            [10, 8, 12],
        )

    def test_single_choice_uses_exactly_one_private_answer(self):
        source_step = next(
            step
            for course in self.manifest["courses"]
            for module in course["modules"]
            for step in module["steps"]
            if step["type_key"] == "quiz.single_choice"
        )
        imported = self.steps[source_step["source_id"]]
        self.assertEqual(
            imported.content["correct_option_id"],
            source_step["private_assessment"]["correct_option_ids"][0],
        )

    def test_multiline_python_test_inputs_are_preserved(self):
        imported = self.steps["3.1.4"]
        source_cases = next(
            step["private_assessment"]["test_cases"]
            for course in self.manifest["courses"]
            for module in course["modules"]
            for step in module["steps"]
            if step["source_id"] == "3.1.4"
        )
        self.assertEqual(
            imported.content["tests"],
            [
                {"input": case["input"], "output": case["expected_output"]}
                for case in source_cases
            ],
        )
        self.assertEqual(imported.content["tests"][0]["input"], "20\n21\n22")

    def test_curator_criteria_are_kept_separate_until_server_storage(self):
        source_step = next(
            step
            for course in self.manifest["courses"]
            for module in course["modules"]
            for step in module["steps"]
            if step["type_key"] == "artifact.minecraft"
        )
        imported = self.steps[source_step["source_id"]]
        criteria = "\n".join(source_step["private_assessment"]["curator_criteria"])
        self.assertNotIn("review_criteria", imported.content)
        self.assertEqual(imported.review_criteria, criteria)
        self.assertEqual(imported.draft_content()["review_criteria"], criteria)

    def test_scratch_hint_is_imported_but_hidden_from_step_content(self):
        imported = self.steps["1.1.3"]
        source = self.manifest["courses"][0]["modules"][0]["steps"][2]
        hint = "\n".join(source["private_assessment"]["feedback_after_incorrect"])
        self.assertEqual(imported.content["feedback_after_incorrect"], hint)
        public = public_step_content(imported.type_key, imported.schema_version, imported.draft_content())
        self.assertNotIn("feedback_after_incorrect", public)
        self.assertNotIn("accepted_answers", public)

    def test_preflight_command_outputs_only_a_summary(self):
        output = StringIO()
        call_command("preflight_curriculum_import", stdout=output)
        result = json.loads(output.getvalue())
        self.assertEqual(result, import_plan_summary(self.plan))
        self.assertNotIn("correct_option_id", output.getvalue())
        self.assertNotIn("review_criteria", output.getvalue())
        self.assertNotIn("Подсказка для ученика", output.getvalue())

    def test_ambiguous_single_choice_is_rejected(self):
        manifest = deepcopy(self.manifest)
        single_choice = next(
            step
            for course in manifest["courses"]
            for module in course["modules"]
            for step in module["steps"]
            if step["type_key"] == "quiz.single_choice"
        )
        single_choice["private_assessment"]["correct_option_ids"] = []
        with self.assertRaises(ValueError):
            build_import_plan(manifest)

    def test_duplicate_source_ids_are_rejected(self):
        manifest = deepcopy(self.manifest)
        manifest["courses"][0]["modules"][0]["source_id"] = manifest["courses"][0]["source_id"]
        with self.assertRaises(ValueError):
            build_import_plan(manifest)

    def test_missing_score_is_rejected_before_database_import(self):
        manifest = deepcopy(self.manifest)
        manifest["courses"][0]["modules"][0]["steps"][0]["max_score"] = None
        with self.assertRaisesRegex(ValueError, "max_score должен быть положительным числом"):
            build_import_plan(manifest)

    def test_empty_scratch_hint_is_rejected_before_database_import(self):
        manifest = deepcopy(self.manifest)
        manifest["courses"][0]["modules"][0]["steps"][2]["private_assessment"]["feedback_after_incorrect"] = [""]
        with self.assertRaisesRegex(ValueError, "feedback_after_incorrect"):
            build_import_plan(manifest)
