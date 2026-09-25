"""Student submission rules. Official Python grades come from the isolated runner."""

import hashlib
import json
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils.crypto import constant_time_compare
from rest_framework import serializers
from rest_framework.exceptions import APIException

from apps.learning.models import Enrollment, Submission
from apps.learning.services import step_is_unlocked
from config.exceptions import FileTooLarge
from .runner_client import grade_python


class Conflict(APIException):
    status_code = 409
    default_detail = "Состояние шага изменилось; обновите страницу"


ACTIVE = {Submission.Status.QUEUED, Submission.Status.CHECKING, Submission.Status.PENDING_REVIEW}
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf", ".sb3", ".mcworld"}
MAX_CODE_BYTES = 64 * 1024
MAX_INPUT_BYTES = 64 * 1024
MAX_OUTPUT_BYTES = 64 * 1024
MAX_TESTS = 50


def _code_hash(code):
    if not isinstance(code, str) or not code.strip() or len(code.encode("utf-8")) > MAX_CODE_BYTES:
        raise serializers.ValidationError({"code": ["Нужен код Python размером до 64 КБ"]})
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _limits(step):
    content = step.content
    time_ms = content.get("time_limit_ms", 1000)
    memory_mb = content.get("memory_limit_mb", 128)
    if type(time_ms) is not int or not 100 <= time_ms <= 30000:
        raise serializers.ValidationError({"step": ["Некорректный лимит времени в задании"]})
    if type(memory_mb) is not int or not 16 <= memory_mb <= 512:
        raise serializers.ValidationError({"step": ["Некорректный лимит памяти в задании"]})
    tests = content.get("tests", [])
    if not isinstance(tests, list) or not 1 <= len(tests) <= MAX_TESTS or any(
        not isinstance(test, dict) or not isinstance(test.get("input"), str)
        or len(test["input"].encode("utf-8")) > MAX_INPUT_BYTES
        or not isinstance(test.get("output"), str)
        or len(test["output"].encode("utf-8")) > MAX_OUTPUT_BYTES
        for test in tests
    ):
        raise serializers.ValidationError({"step": ["Нужно 1–50 тестов с входом и ответом до 64 КБ"]})
    if len(tests) * time_ms > 45000:
        raise serializers.ValidationError({"step": ["Суммарный бюджет тестов превышает 45 секунд"]})
    return {"time_limit_ms": time_ms, "memory_limit_mb": memory_mb, "output_limit_bytes": MAX_OUTPUT_BYTES}


def create_python_sample(*, enrollment, step):
    if step.type_key != "algorithm.python":
        raise serializers.ValidationError({"step": ["Это не задача Python"]})
    if enrollment.status != Enrollment.Status.ACTIVE:
        raise Conflict("Назначение не активно")
    limits = _limits(step)
    # One intentionally open example. Hidden tests and their expected answers
    # never enter the browser during official grading.
    samples = step.content.get("examples") or step.content["tests"][:1]
    sample = samples[0]
    return {
        "sample": {"input": sample["input"], "output": str(sample["output"])},
        "limits": limits,
    }


def _check_python(*, step, code):
    _code_hash(code)
    limits = _limits(step)
    return grade_python(code=code, tests=step.content["tests"], limits=limits)


def _file_fingerprint(upload):
    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return digest.hexdigest()


def _validate_file(upload):
    if upload.size > settings.MAX_UPLOAD_SIZE:
        raise FileTooLarge
    suffix = Path(upload.name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise serializers.ValidationError({"file": ["Неподдерживаемый формат файла"]})
    signatures = {
        ".png": (b"\x89PNG\r\n\x1a\n",),
        ".jpg": (b"\xff\xd8\xff",), ".jpeg": (b"\xff\xd8\xff",),
        ".pdf": (b"%PDF-",), ".sb3": (b"PK\x03\x04",), ".mcworld": (b"PK\x03\x04",),
    }
    prefix = upload.read(8)
    upload.seek(0)
    if not any(prefix.startswith(signature) for signature in signatures[suffix]):
        raise serializers.ValidationError({"file": ["Содержимое файла не соответствует формату"]})


def _evaluate(*, enrollment, step, user, data, upload):
    kind = step.type_key
    if kind == "theory":
        return Submission.Status.ACCEPTED, {"action": "complete"}, {}, "Теория изучена"
    if kind == "quiz.single_choice":
        answer = data["answer"]
        valid_ids = {str(choice["id"]) for choice in step.content["choices"]}
        if answer not in valid_ids:
            raise serializers.ValidationError({"answer": ["Выберите один из вариантов задания"]})
        accepted = answer == str(step.content["correct_option_id"])
        return (Submission.Status.ACCEPTED if accepted else Submission.Status.INCORRECT, {"answer": answer}, {},
                "Верно" if accepted else "Попробуйте ещё раз")
    if kind == "quiz.multiple_choice":
        answer = data["answer"]
        valid_ids = {str(choice["id"]) for choice in step.content["choices"]}
        if len(answer) != len(set(answer)) or not set(answer).issubset(valid_ids):
            raise serializers.ValidationError({"answer": ["Выберите варианты из задания без повторов"]})
        accepted = set(answer) == set(step.content["correct_option_ids"])
        return (Submission.Status.ACCEPTED if accepted else Submission.Status.INCORRECT, {"answer": answer}, {},
                "Верно" if accepted else "Попробуйте ещё раз")
    if kind in {"answer.exact", "scratch.numeric_answer"}:
        answer = data["answer"]
        accepted = answer.strip() in {item.strip() for item in step.content["accepted_answers"]}
        incorrect_feedback = (
            step.content.get("feedback_after_incorrect", "Попробуйте ещё раз")
            if kind == "scratch.numeric_answer" else "Попробуйте ещё раз"
        )
        return (Submission.Status.ACCEPTED if accepted else Submission.Status.INCORRECT, {"answer": answer}, {},
                "Верно" if accepted else incorrect_feedback)
    if kind == "algorithm.python":
        result = _check_python(step=step, code=data["code"])
        status = result["status"]
        diagnostics = {key: result[key] for key in ("passed_tests", "total_tests", "reason")}
        feedback = ("Ошибка среды выполнения; попробуйте снова" if status == Submission.Status.ERROR else
                    "Все тесты пройдены" if status == Submission.Status.ACCEPTED else "Тесты не пройдены")
        return status, {"code": data["code"]}, diagnostics, feedback
    if kind in {"artifact.scratch", "artifact.minecraft", "artifact.project"}:
        missing = [field for field in step.content.get("required_evidence", [])
                   if not (upload if field == "file" else data.get(field, "").strip())]
        if missing:
            raise serializers.ValidationError({field: ["Обязательное доказательство для этого шага"]
                                               for field in missing})
        evidence = {key: data[key] for key in ("url", "explanation") if key in data}
        return Submission.Status.PENDING_REVIEW, evidence, {}, "Ожидает проверки куратора"
    raise serializers.ValidationError({"step": ["Неподдерживаемый тип задания"]})


@transaction.atomic
def create_submission(*, enrollment, step, user, data, upload, idempotency_key):
    # Enrollment row serializes submissions even on databases without row-level locks.
    enrollment = Enrollment.objects.select_for_update().get(pk=enrollment.pk)
    if enrollment.status != Enrollment.Status.ACTIVE:
        raise Conflict("Назначение не активно")
    if not step_is_unlocked(enrollment, step):
        raise Conflict("Сначала завершите предыдущие шаги курса")
    scope = f"{enrollment.pk}:{step.pk}"
    if upload:
        _validate_file(upload)
    fingerprint = _file_fingerprint(upload) if upload else None
    canonical = json.dumps({"data": data, "file_hash": fingerprint}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    request_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if idempotency_key:
        existing = Submission.objects.filter(student=user, idempotency_scope=scope, idempotency_key=idempotency_key).first()
        if existing:
            if not constant_time_compare(existing.request_hash, request_hash):
                raise Conflict("Idempotency-Key уже использован с другим содержимым")
            return existing, False
    previous = Submission.objects.filter(enrollment=enrollment, step=step).order_by("-attempt_number").first()
    if previous and previous.status in ACTIVE:
        raise Conflict("Предыдущая попытка ещё проверяется")
    if (step.type_key != "algorithm.python" and
            Submission.objects.filter(enrollment=enrollment, step=step, status=Submission.Status.ACCEPTED).exists()):
        raise Conflict("Шаг уже принят")
    status, payload, diagnostics, feedback = _evaluate(enrollment=enrollment, step=step, user=user, data=data, upload=upload)
    submission = Submission.objects.create(
        enrollment=enrollment, step=step, student=user,
        attempt_number=previous.attempt_number + 1 if previous else 1,
        status=status, payload=payload, artifact_url=data.get("url", ""),
        score=step.max_score if status == Submission.Status.ACCEPTED else (0 if status == Submission.Status.INCORRECT else None),
        feedback=feedback, safe_diagnostics=diagnostics,
        idempotency_key=idempotency_key, idempotency_scope=scope if idempotency_key else "", request_hash=request_hash,
    )
    if upload:
        submission.artifact_file.save(upload.name, upload, save=True)
    return submission, True
