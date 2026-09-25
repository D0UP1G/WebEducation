"""Build a validated, database-independent import plan from the curriculum map."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

from .step_types import validate_step_content


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MANIFEST = REPOSITORY_ROOT / "docs" / "organizer" / "curriculum-map.json"


@dataclass(frozen=True)
class StepImport:
    source_id: str
    type_key: str
    schema_version: int
    position: int
    title: str
    content: dict[str, Any]
    max_score: int
    review_criteria: str

    def draft_content(self) -> dict[str, Any]:
        """Return the server-side JSON value; callers must never serialize it to students directly."""
        content = dict(self.content)
        if self.review_criteria:
            content["review_criteria"] = self.review_criteria
        return content


@dataclass(frozen=True)
class ModuleImport:
    source_id: str
    position: int
    title: str
    steps: tuple[StepImport, ...]


@dataclass(frozen=True)
class CourseImport:
    source_id: str
    position: int
    title: str
    grade_min: int
    grade_max: int
    tool: str
    goal: str
    volume: str
    modules: tuple[ModuleImport, ...]


def load_curriculum_manifest(
    path: Path = DEFAULT_MANIFEST,
    *,
    verify_source: bool = True,
) -> dict[str, Any]:
    manifest_path = path.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError("Корень манифеста должен быть JSON-объектом")
    source = manifest.get("source")
    if (
        not isinstance(source, dict)
        or not isinstance(source.get("path"), str)
        or not isinstance(source.get("sha256"), str)
    ):
        raise ValueError("В манифесте отсутствует путь к исходному документу")

    source_path = (REPOSITORY_ROOT / source["path"]).resolve()
    try:
        source_path.relative_to(REPOSITORY_ROOT.resolve())
    except ValueError as exc:
        raise ValueError("Путь исходного документа выходит за пределы репозитория") from exc
    if verify_source:
        if not source_path.is_file():
            raise ValueError(f"Исходный документ не найден: {source['path']}")

        actual_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
        if actual_hash != source["sha256"]:
            raise ValueError("SHA-256 исходного DOCX не совпадает с манифестом")
    return manifest


def _required_text(item: dict[str, Any], field: str, context: str) -> str:
    value = item.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context}: поле {field} должно быть непустой строкой")
    return value


def _source_id(item: dict[str, Any], context: str, seen: set[str]) -> str:
    source_id = _required_text(item, "source_id", context)
    if source_id in seen:
        raise ValueError(f"Повторяется source_id {source_id}")
    seen.add(source_id)
    return source_id


def _position(item: dict[str, Any], expected: int, context: str) -> int:
    position = item.get("position")
    if type(position) is not int or position != expected:
        raise ValueError(f"{context}: ожидалась позиция {expected}, получено {position!r}")
    return position


def _step_content(step: dict[str, Any], context: str) -> tuple[dict[str, Any], str]:
    type_key = _required_text(step, "type_key", context)
    student = step.get("student_content")
    assessment = step.get("private_assessment")
    if not isinstance(student, dict) or not isinstance(assessment, dict):
        raise ValueError(f"{context}: нужны student_content и private_assessment")

    review_criteria = ""
    if type_key == "theory":
        content = {"body": _required_text(student, "body", context)}
    elif type_key in {"quiz.single_choice", "quiz.multiple_choice"}:
        content = {
            "question": _required_text(student, "question", context),
            "choices": student.get("choices"),
        }
        correct_ids = assessment.get("correct_option_ids")
        if not isinstance(correct_ids, list) or not all(isinstance(value, str) for value in correct_ids):
            raise ValueError(f"{context}: private_assessment.correct_option_ids должен быть списком строк")
        if type_key == "quiz.single_choice":
            if len(correct_ids) != 1:
                raise ValueError(f"{context}: для quiz.single_choice нужен ровно один верный вариант")
            content["correct_option_id"] = correct_ids[0]
        else:
            content["correct_option_ids"] = correct_ids
    elif type_key in {"answer.exact", "scratch.numeric_answer"}:
        content = {
            "prompt": _required_text(student, "prompt", context),
            "accepted_answers": assessment.get("accepted_answers"),
        }
        if type_key == "scratch.numeric_answer" and "feedback_after_incorrect" in assessment:
            feedback = assessment["feedback_after_incorrect"]
            if not isinstance(feedback, list) or not feedback or not all(
                isinstance(item, str) and item.strip() for item in feedback
            ):
                raise ValueError(f"{context}: feedback_after_incorrect должен быть непустым списком строк")
            content["feedback_after_incorrect"] = "\n".join(feedback)
    elif type_key == "algorithm.python":
        cases = assessment.get("test_cases")
        if not isinstance(cases, list):
            raise ValueError(f"{context}: private_assessment.test_cases должен быть списком")
        tests = []
        for index, case in enumerate(cases, start=1):
            if not isinstance(case, dict) or "input" not in case or "expected_output" not in case:
                raise ValueError(f"{context}: тест {index} должен содержать input и expected_output")
            tests.append({"input": case["input"], "output": case["expected_output"]})
        content = {
            "statement": _required_text(student, "statement", context),
            "examples": student.get("examples", []),
            "tests": tests,
            "time_limit_ms": student.get("time_limit_ms", assessment.get("time_limit_ms", 1000)),
            "memory_limit_mb": student.get("memory_limit_mb", assessment.get("memory_limit_mb", 128)),
        }
    elif type_key in {"artifact.scratch", "artifact.minecraft", "artifact.project"}:
        criteria = assessment.get("curator_criteria", [])
        if not isinstance(criteria, list) or not all(isinstance(value, str) for value in criteria):
            raise ValueError(f"{context}: curator_criteria должен быть списком строк")
        required_evidence = student.get("required_evidence", [])
        if (
            not isinstance(required_evidence, list)
            or not required_evidence
            or not all(
                isinstance(value, str) and value in {"file", "url", "explanation"}
                for value in required_evidence
            )
            or len(set(required_evidence)) != len(required_evidence)
            or not {"file", "url"}.intersection(required_evidence)
        ):
            raise ValueError(f"{context}: required_evidence содержит недопустимые или повторные значения")
        review_criteria = "\n".join(criteria)
        if not review_criteria.strip() or len(review_criteria) > 10000:
            raise ValueError(f"{context}: curator_criteria должны занимать от 1 до 10000 символов")
        content = {
            "instructions": _required_text(student, "instructions", context),
            "required_evidence": required_evidence,
        }
    else:
        raise ValueError(f"{context}: неизвестный type_key {type_key}")

    schema_version = step.get("schema_version", 1)
    if type(schema_version) is not int or schema_version < 1:
        raise ValueError(f"{context}: некорректная schema_version")
    validate_step_content(type_key, schema_version, content)

    max_score = step.get("max_score")
    if type(max_score) is not int or max_score < 1:
        raise ValueError(f"{context}: max_score должен быть положительным числом")
    return content, review_criteria


def build_import_plan(manifest: dict[str, Any]) -> tuple[CourseImport, ...]:
    if not isinstance(manifest, dict):
        raise ValueError("Корень манифеста должен быть JSON-объектом")
    if manifest.get("manifest_version") != 1:
        raise ValueError("Неподдерживаемая версия карты курса")
    courses = manifest.get("courses")
    if not isinstance(courses, list) or not courses:
        raise ValueError("В карте нет курсов")

    seen_source_ids: set[str] = set()
    plan = []
    for course_index, course in enumerate(courses, start=1):
        course_context = f"Курс {course_index}"
        if not isinstance(course, dict):
            raise ValueError(f"{course_context}: ожидался объект")
        course_id = _source_id(course, course_context, seen_source_ids)
        course_position = _position(course, course_index, course_context)
        modules = course.get("modules")
        if not isinstance(modules, list) or not modules:
            raise ValueError(f"{course_context}: должен содержать хотя бы один модуль")

        module_plan = []
        for module_index, module in enumerate(modules, start=1):
            module_context = f"Курс {course_id}, модуль {module_index}"
            if not isinstance(module, dict):
                raise ValueError(f"{module_context}: ожидался объект")
            module_id = _source_id(module, module_context, seen_source_ids)
            module_position = _position(module, module_index, module_context)
            steps = module.get("steps")
            if not isinstance(steps, list) or not steps:
                raise ValueError(f"{module_context}: должен содержать хотя бы один шаг")

            step_plan = []
            for step_index, step in enumerate(steps, start=1):
                step_context = f"Курс {course_id}, шаг {step_index}"
                if not isinstance(step, dict):
                    raise ValueError(f"{step_context}: ожидался объект")
                step_context = f"Курс {course_id}, шаг {step.get('source_id', step_index)}"
                step_id = _source_id(step, step_context, seen_source_ids)
                step_position = _position(step, step_index, step_context)
                content, review_criteria = _step_content(step, step_context)
                step_plan.append(
                    StepImport(
                        source_id=step_id,
                        type_key=step["type_key"],
                        schema_version=step.get("schema_version", 1),
                        position=step_position,
                        title=_required_text(step, "title", step_context),
                        content=content,
                        max_score=step.get("max_score"),
                        review_criteria=review_criteria,
                    )
                )
            module_plan.append(
                ModuleImport(
                    source_id=module_id,
                    position=module_position,
                    title=_required_text(module, "title", module_context),
                    steps=tuple(step_plan),
                )
            )

        grade_min = course.get("grade_min")
        grade_max = course.get("grade_max")
        if (
            type(grade_min) is not int
            or type(grade_max) is not int
            or grade_min < 1
            or grade_min > grade_max
        ):
            raise ValueError(f"{course_context}: некорректный диапазон классов")
        plan.append(
            CourseImport(
                source_id=course_id,
                position=course_position,
                title=_required_text(course, "title", course_context),
                grade_min=grade_min,
                grade_max=grade_max,
                tool=_required_text(course, "tool", course_context),
                goal=_required_text(course, "goal", course_context),
                volume=_required_text(course, "volume", course_context),
                modules=tuple(module_plan),
            )
        )
    return tuple(plan)


def import_plan_summary(plan: tuple[CourseImport, ...]) -> dict[str, int]:
    modules = [module for course in plan for module in course.modules]
    steps = [step for module in modules for step in module.steps]
    return {
        "courses": len(plan),
        "modules": len(modules),
        "steps": len(steps),
        "steps_missing_score": sum(step.max_score is None for step in steps),
        "total_max_score": sum(step.max_score for step in steps),
        "manual_steps_with_criteria": sum(bool(step.review_criteria) for step in steps),
    }
