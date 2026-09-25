from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework import exceptions, serializers

from apps.learning.models import Enrollment
from config.exceptions import StateConflict
from .models import Course, CourseRevision, DraftStep, ModuleRevision, StepRevision
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
    missing = []
    if "theory" not in type_keys:
        missing.append("Добавьте шаг с теорией")
    if not type_keys.intersection({"quiz.single_choice", "quiz.multiple_choice"}):
        missing.append("Добавьте контрольный вопрос с одним или несколькими вариантами ответа")
    if missing:
        raise serializers.ValidationError({"steps": missing})
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
        source_id=course.source_id,
        tool=course.tool,
        goal=course.goal,
        volume=course.volume,
        banner_image=course.banner_image.name if course.banner_image else "",
        published_by=actor,
    )
    modules = list(course.modules.order_by("position"))
    module_revisions = {
        module.id: ModuleRevision.objects.create(
            revision=revision,
            module=module,
            source_id=module.source_id,
            position=module.position,
            title=module.title,
        )
        for module in modules
    }
    StepRevision.objects.bulk_create(
        [
            StepRevision(
                revision=revision,
                module_revision=module_revisions.get(step.module_id),
                source_draft_step_id=step.id,
                source_id=step.source_id,
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
    if course.is_archived:
        raise serializers.ValidationError({"course_id": ["Архивный курс нельзя назначить"]})
    if student.role != student.Role.STUDENT:
        raise serializers.ValidationError({"student_id": ["Нужен пользователь с ролью student"]})
    if curator.role != curator.Role.CURATOR:
        raise serializers.ValidationError({"curator_id": ["Нужен пользователь с ролью curator"]})
    if not student.is_active:
        raise serializers.ValidationError({"student_id": ["Аккаунт ученика отключён"]})
    if not curator.is_active:
        raise serializers.ValidationError({"curator_id": ["Аккаунт куратора отключён"]})

    existing = Enrollment.objects.select_for_update().filter(revision=course.latest_revision, student=student).first()
    if existing:
        if existing.status != Enrollment.Status.REMOVED:
            raise StateConflict("Этот курс уже назначен ученику в текущей версии")
        existing.status = status
        existing.curator = curator
        existing.save(update_fields=("status", "curator", "updated_at"))
        return existing

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
