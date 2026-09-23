from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from .models import Course, CourseRevision, StepRevision
from .step_types import validate_step_content


@transaction.atomic
def publish_course(*, course_id, actor):
    course = Course.objects.select_for_update().get(pk=course_id)
    draft_steps = list(course.draft_steps.order_by("position"))
    if not draft_steps:
        raise serializers.ValidationError({"steps": ["Нельзя опубликовать пустой курс"]})

    type_keys = {step.type_key for step in draft_steps}
    missing = {"theory", "quiz.single_choice"} - type_keys
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

