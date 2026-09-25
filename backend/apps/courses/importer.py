"""Persist the validated organizer curriculum as idempotent course drafts."""

from pathlib import Path

from django.db import transaction

from .import_plan import DEFAULT_MANIFEST, build_import_plan, import_plan_summary, load_curriculum_manifest
from .models import Course, DraftStep, Module
from .services import publish_course


def _revision_matches_draft(course):
    revision = course.latest_revision
    if revision is None:
        return False
    if (
        revision.title,
        revision.description,
        revision.grade_min,
        revision.grade_max,
        revision.source_id,
        revision.tool,
        revision.goal,
        revision.volume,
    ) != (
        course.title,
        course.description,
        course.grade_min,
        course.grade_max,
        course.source_id,
        course.tool,
        course.goal,
        course.volume,
    ):
        return False

    draft_modules = list(course.modules.order_by("position"))
    revision_modules = list(revision.modules.order_by("position"))
    if [
        (module.source_id, module.position, module.title) for module in draft_modules
    ] != [
        (module.source_id, module.position, module.title) for module in revision_modules
    ]:
        return False

    draft_steps = list(course.draft_steps.select_related("module").order_by("position"))
    revision_steps = list(revision.steps.select_related("module_revision").order_by("position"))
    return [
        (
            step.source_id,
            step.type_key,
            step.schema_version,
            step.position,
            step.title,
            step.content,
            step.max_score,
            step.module.source_id if step.module else None,
        )
        for step in draft_steps
    ] == [
        (
            step.source_id,
            step.type_key,
            step.schema_version,
            step.position,
            step.title,
            step.content,
            step.max_score,
            step.module_revision.source_id if step.module_revision else None,
        )
        for step in revision_steps
    ]


@transaction.atomic
def import_curriculum(*, owner, manifest_path: Path = DEFAULT_MANIFEST, publish: bool = False):
    """Import the organizer package without duplicating courses, modules or steps."""
    manifest = load_curriculum_manifest(manifest_path)
    plan = build_import_plan(manifest)
    published_courses = 0

    for course_import in plan:
        course, _ = Course.objects.get_or_create(
            source_id=course_import.source_id,
            defaults={
                "owner": owner,
                "title": course_import.title,
                "description": course_import.goal,
                "grade_min": course_import.grade_min,
                "grade_max": course_import.grade_max,
                "tool": course_import.tool,
                "goal": course_import.goal,
                "volume": course_import.volume,
            },
        )
        course.title = course_import.title
        course.description = course_import.goal
        course.grade_min = course_import.grade_min
        course.grade_max = course_import.grade_max
        course.tool = course_import.tool
        course.goal = course_import.goal
        course.volume = course_import.volume
        course.save(
            update_fields=("title", "description", "grade_min", "grade_max", "tool", "goal", "volume", "updated_at")
        )

        position = 0
        for module_import in course_import.modules:
            module, _ = Module.objects.get_or_create(
                course=course,
                source_id=module_import.source_id,
                defaults={"position": module_import.position, "title": module_import.title},
            )
            module.position = module_import.position
            module.title = module_import.title
            module.save(update_fields=("position", "title", "updated_at"))

            for step_import in module_import.steps:
                position += 1
                step, _ = DraftStep.objects.get_or_create(
                    course=course,
                    source_id=step_import.source_id,
                    defaults={
                        "module": module,
                        "type_key": step_import.type_key,
                        "schema_version": step_import.schema_version,
                        "position": position,
                        "title": step_import.title,
                        "content": step_import.draft_content(),
                        "max_score": step_import.max_score,
                    },
                )
                step.module = module
                step.type_key = step_import.type_key
                step.schema_version = step_import.schema_version
                step.position = position
                step.title = step_import.title
                step.content = step_import.draft_content()
                step.max_score = step_import.max_score
                step.save(
                    update_fields=(
                        "module",
                        "type_key",
                        "schema_version",
                        "position",
                        "title",
                        "content",
                        "max_score",
                        "updated_at",
                    )
                )

        if publish and not _revision_matches_draft(course):
            publish_course(course_id=course.id, actor=owner)
            published_courses += 1

    summary = import_plan_summary(plan)
    summary["published_courses"] = published_courses
    return summary
