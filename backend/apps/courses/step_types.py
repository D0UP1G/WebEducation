from dataclasses import dataclass
from typing import Callable

from rest_framework import serializers


Validator = Callable[[dict], None]
Sanitizer = Callable[[dict], dict]


@dataclass(frozen=True)
class StepTypeDefinition:
    type_key: str
    schema_version: int
    title: str
    checking_mode: str
    validate: Validator
    to_public: Sanitizer


def _required_text(content, field):
    value = content.get(field)
    if not isinstance(value, str) or not value.strip():
        raise serializers.ValidationError({f"content.{field}": ["Обязательная непустая строка"]})


def _validate_theory(content):
    _required_text(content, "body")


def _quiz_choice_ids(content):
    _required_text(content, "question")
    choices = content.get("choices")
    if not isinstance(choices, list) or len(choices) < 2:
        raise serializers.ValidationError({"content.choices": ["Нужно минимум два варианта"]})
    ids = {str(item.get("id")) for item in choices if isinstance(item, dict) and item.get("text")}
    if len(ids) != len(choices):
        raise serializers.ValidationError({"content.choices": ["Каждый вариант должен иметь уникальные id и text"]})
    return ids


def _validate_quiz(content):
    ids = _quiz_choice_ids(content)
    if str(content.get("correct_option_id")) not in ids:
        raise serializers.ValidationError({"content.correct_option_id": ["Правильный вариант должен существовать"]})


def _validate_multiple_choice(content):
    ids = _quiz_choice_ids(content)
    correct_ids = content.get("correct_option_ids")
    if not isinstance(correct_ids, list) or not correct_ids or not all(isinstance(item, str) for item in correct_ids):
        raise serializers.ValidationError({"content.correct_option_ids": ["Выберите хотя бы один правильный вариант"]})
    if len(set(correct_ids)) != len(correct_ids) or not set(correct_ids).issubset(ids):
        raise serializers.ValidationError({"content.correct_option_ids": ["Правильные варианты должны существовать и не повторяться"]})


def _validate_exact(content):
    _required_text(content, "prompt")
    answers = content.get("accepted_answers")
    if not isinstance(answers, list) or not answers or not all(isinstance(item, str) and item.strip() for item in answers):
        raise serializers.ValidationError({"content.accepted_answers": ["Укажите хотя бы один допустимый ответ"]})


def _validate_python(content):
    _required_text(content, "statement")
    tests = content.get("tests")
    if not isinstance(tests, list) or not 1 <= len(tests) <= 50:
        raise serializers.ValidationError({"content.tests": ["Нужно от 1 до 50 тестов"]})
    for index, test in enumerate(tests):
        if not isinstance(test, dict) or "input" not in test or "output" not in test:
            raise serializers.ValidationError({f"content.tests.{index}": ["Тест должен содержать input и output"]})
        if not isinstance(test["input"], str) or len(test["input"].encode("utf-8")) > 64 * 1024:
            raise serializers.ValidationError({f"content.tests.{index}.input": ["Вход теста должен быть строкой до 64 КБ"]})
        if not isinstance(test["output"], str) or len(test["output"].encode("utf-8")) > 64 * 1024:
            raise serializers.ValidationError({f"content.tests.{index}.output": ["Вывод теста должен быть строкой до 64 КБ"]})
    for field, default, minimum, maximum in (("time_limit_ms", 1000, 100, 30000),
                                              ("memory_limit_mb", 128, 16, 512)):
        value = content.get(field, default)
        if type(value) is not int or not minimum <= value <= maximum:
            raise serializers.ValidationError({f"content.{field}": [f"Допустимое значение: {minimum}–{maximum}"]})


def _validate_artifact(content):
    _required_text(content, "instructions")
    required = content.get("required_evidence")
    if required is not None:
        allowed = {"file", "url", "explanation"}
        if (not isinstance(required, list) or not required or
                not all(isinstance(item, str) and item in allowed for item in required) or
                len(required) != len(set(required)) or not {"file", "url"}.intersection(required)):
            raise serializers.ValidationError({"content.required_evidence": [
                "Укажите уникальные поля file, url, explanation; нужен file или url"
            ]})
    criteria = content.get("review_criteria")
    if criteria is not None and (not isinstance(criteria, str) or not criteria.strip() or len(criteria) > 10000):
        raise serializers.ValidationError({"content.review_criteria": ["Нужен текст критериев до 10000 символов"]})


def _identity(content):
    return dict(content)


def _without(*hidden_fields):
    def sanitize(content):
        return {key: value for key, value in content.items() if key not in hidden_fields}

    return sanitize


STEP_TYPES = {
    item.type_key: item
    for item in (
        StepTypeDefinition("theory", 1, "Теория", "instant", _validate_theory, _identity),
        StepTypeDefinition(
            "quiz.single_choice", 1, "Один вариант", "instant", _validate_quiz, _without("correct_option_id")
        ),
        StepTypeDefinition(
            "quiz.multiple_choice", 1, "Несколько верных вариантов", "instant", _validate_multiple_choice,
            _without("correct_option_ids"),
        ),
        StepTypeDefinition("answer.exact", 1, "Точный ответ", "instant", _validate_exact, _without("accepted_answers")),
        StepTypeDefinition(
            "scratch.numeric_answer", 1, "Scratch: ответ числом", "instant", _validate_exact,
            _without("accepted_answers"),
        ),
        StepTypeDefinition(
            "algorithm.python", 1, "Python по тестам", "browser", _validate_python, _without("tests")
        ),
        StepTypeDefinition("artifact.scratch", 1, "Scratch", "manual", _validate_artifact,
                           _without("review_criteria")),
        StepTypeDefinition("artifact.minecraft", 1, "Minecraft Education", "manual", _validate_artifact,
                           _without("review_criteria")),
        StepTypeDefinition("artifact.project", 1, "Проект", "manual", _validate_artifact,
                           _without("review_criteria")),
    )
}


def get_step_type(type_key, schema_version=1):
    definition = STEP_TYPES.get(type_key)
    if definition is None or definition.schema_version != schema_version:
        raise serializers.ValidationError(
            {"type_key": [f"Неподдерживаемый тип или версия: {type_key}@{schema_version}"]}
        )
    return definition


def validate_step_content(type_key, schema_version, content):
    if not isinstance(content, dict):
        raise serializers.ValidationError({"content": ["Ожидается JSON-объект"]})
    get_step_type(type_key, schema_version).validate(content)


def public_step_content(type_key, schema_version, content):
    definition = get_step_type(type_key, schema_version)
    visible = definition.to_public(content)
    if definition.checking_mode == "manual":
        visible.pop("review_criteria", None)
    return visible


def curator_step_content(type_key, schema_version, content):
    visible = public_step_content(type_key, schema_version, content)
    if get_step_type(type_key, schema_version).checking_mode == "manual" and "review_criteria" in content:
        visible["review_criteria"] = content["review_criteria"]
    return visible
