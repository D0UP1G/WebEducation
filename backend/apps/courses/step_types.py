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


def _validate_quiz(content):
    _required_text(content, "question")
    choices = content.get("choices")
    if not isinstance(choices, list) or len(choices) < 2:
        raise serializers.ValidationError({"content.choices": ["Нужно минимум два варианта"]})
    ids = {str(item.get("id")) for item in choices if isinstance(item, dict) and item.get("text")}
    if len(ids) != len(choices):
        raise serializers.ValidationError({"content.choices": ["Каждый вариант должен иметь уникальные id и text"]})
    if str(content.get("correct_option_id")) not in ids:
        raise serializers.ValidationError({"content.correct_option_id": ["Правильный вариант должен существовать"]})


def _validate_exact(content):
    _required_text(content, "prompt")
    answers = content.get("accepted_answers")
    if not isinstance(answers, list) or not answers or not all(isinstance(item, str) and item.strip() for item in answers):
        raise serializers.ValidationError({"content.accepted_answers": ["Укажите хотя бы один допустимый ответ"]})


def _validate_python(content):
    _required_text(content, "statement")
    tests = content.get("tests")
    if not isinstance(tests, list) or not tests:
        raise serializers.ValidationError({"content.tests": ["Нужен хотя бы один тест"]})
    for index, test in enumerate(tests):
        if not isinstance(test, dict) or "input" not in test or "output" not in test:
            raise serializers.ValidationError({f"content.tests.{index}": ["Тест должен содержать input и output"]})


def _validate_artifact(content):
    _required_text(content, "instructions")


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
        StepTypeDefinition("answer.exact", 1, "Точный ответ", "instant", _validate_exact, _without("accepted_answers")),
        StepTypeDefinition(
            "algorithm.python", 1, "Python по тестам", "worker", _validate_python, _without("tests")
        ),
        StepTypeDefinition("artifact.scratch", 1, "Scratch", "manual", _validate_artifact, _identity),
        StepTypeDefinition("artifact.minecraft", 1, "Minecraft Education", "manual", _validate_artifact, _identity),
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
    return get_step_type(type_key, schema_version).to_public(content)

