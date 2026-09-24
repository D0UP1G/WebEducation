from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import exceptions, serializers

from apps.learning.models import Enrollment
from config.exceptions import StateConflict
from .models import Course, CourseRevision, DraftStep, StepRevision
from .step_types import validate_step_content


def _position_error(maximum):
    return serializers.ValidationError({"position": [f"Укажите позицию от 1 до {maximum}"]})


def _persist_order(course, ordered_steps):
    """Move every row through distinct spare positions to satisfy immediate UNIQUE checks."""
    spare_start = max((step.position for step in ordered_steps), default=0) + len(ordered_steps) + 1
    changed_at = timezone.now()
    for index, step in enumerate(ordered_steps):
        DraftStep.objects.filter(pk=step.pk, course=course).update(position=spare_start + index)
    for index, step in enumerate(ordered_steps, start=1):
        DraftStep.objects.filter(pk=step.pk, course=course).update(position=index, updated_at=changed_at)
        step.position = index


@transaction.atomic
def create_draft_step(*, course_id, fields):
    course = Course.objects.select_for_update().get(pk=course_id)
    steps = list(course.draft_steps.order_by("position", "created_at"))
    position = fields.pop("position", len(steps) + 1)
    if not 1 <= position <= len(steps) + 1:
        raise _position_error(len(steps) + 1)
    step = DraftStep.objects.create(course=course, position=max((item.position for item in steps), default=0) + 1, **fields)
    steps.insert(position - 1, step)
    _persist_order(course, steps)
    return step


@transaction.atomic
def update_draft_step(*, course_id, step_id, fields):
    course = Course.objects.select_for_update().get(pk=course_id)
    steps = list(course.draft_steps.order_by("position", "created_at"))
    step = next((item for item in steps if item.pk == step_id), None)
    if step is None:
        raise DraftStep.DoesNotExist
    position = fields.pop("position", step.position)
    if not 1 <= position <= len(steps):
        raise _position_error(len(steps))
    for name, value in fields.items():
        setattr(step, name, value)
    if fields:
        step.save(update_fields=(*fields.keys(), "updated_at"))
    if position != step.position:
        steps.remove(step)
        steps.insert(position - 1, step)
        _persist_order(course, steps)
    return step


@transaction.atomic
def delete_draft_step(*, course_id, step_id):
    course = Course.objects.select_for_update().get(pk=course_id)
    steps = list(course.draft_steps.order_by("position", "created_at"))
    step = next((item for item in steps if item.pk == step_id), None)
    if step is None:
        raise DraftStep.DoesNotExist
    step.delete()
    steps.remove(step)
    _persist_order(course, steps)


@transaction.atomic
def publish_course(*, course_id, actor):
    course = Course.objects.select_for_update().get(pk=course_id)
    draft_steps = list(course.draft_steps.order_by("position"))
    if not draft_steps:
        raise serializers.ValidationError({"steps": ["Нельзя опубликовать пустой курс"]})

    type_keys = {step.type_key for step in draft_steps}
    missing = {"theory"} - type_keys
    if missing:
        raise serializers.ValidationError({"steps": [f"Не хватает обязательных типов: {', '.join(sorted(missing))}"]})
    if sum(step.max_score for step in draft_steps) <= 0:
        raise serializers.ValidationError({"steps": ["Сумма баллов должна быть положительной"]})

    errors = {}
    for step in draft_steps:
        try:
            validate_step_content(step.type_key, step.schema_version, step.content)
        except serializers.ValidationError as exc:
            errors[str(step.id)] = exc.detail
    if errors:
        raise serializers.ValidationError({"steps": errors})

    current_version = course.revisions.aggregate(value=Max("version"))["value"] or 0
    revision = CourseRevision.objects.create(
        course=course,
        version=current_version + 1,
        title=course.title,
        description=course.description,
        grade_min=course.grade_min,
        grade_max=course.grade_max,
        published_by=actor,
    )
    StepRevision.objects.bulk_create(
        [
            StepRevision(
                revision=revision,
                source_draft_step_id=step.id,
                type_key=step.type_key,
                schema_version=step.schema_version,
                position=step.position,
                title=step.title,
                content=step.content,
                max_score=step.max_score,
            )
            for step in draft_steps
        ]
    )
    course.latest_revision = revision
    course.save(update_fields=("latest_revision", "updated_at"))
    return revision


@transaction.atomic
def assign_enrollment(*, course_id, student, curator, status=Enrollment.Status.ACTIVE):
    try:
        course = Course.objects.select_for_update().select_related("latest_revision").get(pk=course_id)
    except Course.DoesNotExist as exc:
        raise exceptions.NotFound("Курс не найден") from exc

    if course.latest_revision_id is None:
        raise serializers.ValidationError({"course_id": ["Сначала опубликуйте курс"]})
    if student.role != student.Role.STUDENT:
        raise serializers.ValidationError({"student_id": ["Нужен пользователь с ролью student"]})
    if curator.role != curator.Role.CURATOR:
        raise serializers.ValidationError({"curator_id": ["Нужен пользователь с ролью curator"]})

    try:
        with transaction.atomic():
            return Enrollment.objects.create(
                revision=course.latest_revision,
                student=student,
                curator=curator,
                status=status,
            )
    except IntegrityError as exc:
        raise StateConflict("Этот курс уже назначен ученику в текущей версии") from exc
