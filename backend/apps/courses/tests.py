import hashlib
import json
import math
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MAP_PATH = ROOT / "docs" / "organizer" / "curriculum-map.json"
SOURCE_PATH = ROOT / "docs" / "organizer" / "basic-curriculum.docx"


def _all_steps(manifest):
    for course in manifest["courses"]:
        for module in course["modules"]:
            yield from module["steps"]


def _divisor_count(value):
    count = 0
    for divisor in range(1, math.isqrt(value) + 1):
        if value % divisor == 0:
            count += 1 if divisor * divisor == value else 2
    return count


def _oracle(step_id, raw_input):
    if step_id == "3.1.3":
        return str(sum(map(int, raw_input.split())))
    if step_id == "3.1.4":
        return str(sum((int(count) + 1) // 2 for count in raw_input.splitlines()))
    if step_id == "3.2.3":
        return str(max(map(int, raw_input.split())))
    if step_id == "3.2.4":
        year = int(raw_input)
        leap = year % 400 == 0 or (year % 4 == 0 and year % 100 != 0)
        return "YES" if leap else "NO"
    if step_id == "3.3.3":
        number = int(raw_input)
        return str(number * (number + 1) // 2)
    if step_id == "3.3.4":
        return str(_divisor_count(int(raw_input)))
    raise AssertionError(f"No independent answer oracle for Python step {step_id}")


class CurriculumManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(MAP_PATH.read_text(encoding="utf-8"))
        cls.steps = list(_all_steps(cls.manifest))
        cls.steps_by_id = {step["source_id"]: step for step in cls.steps}

    def test_manifest_is_pinned_to_the_unchanged_source_document(self):
        actual_hash = hashlib.sha256(SOURCE_PATH.read_bytes()).hexdigest()
        self.assertEqual(self.manifest["source"]["sha256"], actual_hash)

    def test_manifest_preserves_three_courses_nine_modules_and_thirty_steps(self):
        self.assertEqual(len(self.manifest["courses"]), 3)
        self.assertEqual(sum(len(course["modules"]) for course in self.manifest["courses"]), 9)
        self.assertEqual(len(self.steps), 30)
        self.assertEqual(len(self.steps_by_id), 30)
        self.assertEqual(
            [course["step_count"] for course in self.manifest["courses"]],
            [10, 8, 12],
        )

    def test_every_step_has_a_type_checking_mode_and_separate_content(self):
        self.assertEqual(self.manifest["score_policy"]["max_score_per_step"], 1)
        self.assertEqual(self.manifest["score_policy"]["total_max_score"], 30)
        for step in self.steps:
            with self.subTest(step=step["source_id"]):
                self.assertTrue(step["source_type"])
                self.assertTrue(step["type_key"])
                self.assertIn(step["checking_mode"], {"on_read", "automatic", "manual"})
                self.assertIn("student_content", step)
                self.assertIn("private_assessment", step)
                self.assertEqual(step["max_score"], 1)

    def test_type_crosswalk_counts_match_the_source_material(self):
        counts = Counter(step["type_key"] for step in self.steps)
        self.assertEqual(
            counts,
            {
                "theory": 8,
                "quiz.single_choice": 5,
                "quiz.multiple_choice": 2,
                "answer.exact": 2,
                "scratch.numeric_answer": 1,
                "artifact.scratch": 2,
                "artifact.minecraft": 2,
                "artifact.project": 2,
                "algorithm.python": 6,
            },
        )
        unsupported = {
            step["type_key"]
            for step in self.steps
            if step["type_support"] != "supported_by_current_registry"
        }
        self.assertEqual(unsupported, set())
        self.assertEqual(self.steps_by_id["1.1.3"]["type_support"], "supported_by_current_registry")

    def test_answers_criteria_solutions_and_full_tests_are_not_student_content(self):
        private_keys = {
            "accepted_answers",
            "correct_option_ids",
            "curator_criteria",
            "reference_solution",
            "test_cases",
        }
        for step in self.steps:
            public_content = step["student_content"]
            with self.subTest(step=step["source_id"]):
                self.assertFalse(private_keys.intersection(public_content))
                self.assertNotIn("source_blocks", public_content)

    def test_python_examples_are_public_and_other_test_cases_remain_private(self):
        python_steps = [step for step in self.steps if step["type_key"] == "algorithm.python"]
        self.assertEqual(len(python_steps), 6)
        for step in python_steps:
            cases = step["private_assessment"]["test_cases"]
            expected_examples = [
                {"input": case["input"], "output": case["expected_output"]}
                for case in cases
                if case["source_visibility"] == "example"
            ]
            self.assertEqual(step["student_content"]["examples"], expected_examples)
            self.assertEqual(len(cases), len(expected_examples) + sum(
                case["source_visibility"] == "source_marked_hidden" for case in cases
            ))

    def test_python_test_expected_outputs_match_independent_problem_oracles(self):
        python_steps = [step for step in self.steps if step["type_key"] == "algorithm.python"]
        for step in python_steps:
            for case in step["private_assessment"]["test_cases"]:
                with self.subTest(step=step["source_id"], source_case=case["source_case"]):
                    self.assertEqual(
                        _oracle(step["source_id"], case["input"]),
                        case["expected_output"].strip(),
                    )

    def test_classroom_problem_keeps_three_separate_input_lines(self):
        cases = self.steps_by_id["3.1.4"]["private_assessment"]["test_cases"]
        self.assertEqual(cases[0]["input"], "20\n21\n22")
        self.assertEqual(cases[1]["input"], "1\n1\n1")
        self.assertTrue(all(len(case["input"].splitlines()) == 3 for case in cases))


if __name__ == "__main__":
    unittest.main()
