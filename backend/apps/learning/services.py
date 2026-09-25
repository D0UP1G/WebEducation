import json
import math

from apps.courses.models import StepRevision
from .models import Enrollment, StepQuestion, Submission


ACTIVE_STATUSES = {Submission.Status.QUEUED, Submission.Status.CHECKING, Submission.Status.PENDING_REVIEW}


def _step_identity(step):
    if step.source_id:
        return ("source", step.source_id)
    return ("draft", str(step.source_draft_step_id))


def _step_progress_signature(step):
    """A completion carries only when the same logical step still means the same task."""
    return (
        _step_identity(step),
        step.type_key,
        step.schema_version,
        json.dumps(step.content, sort_keys=True, ensure_ascii=False, separators=(",", ":")),
        step.max_score,
    )


def step_submission_state(enrollment):
    steps = list(enrollment.revision.steps.order_by("position"))
    current_step_by_signature = {_step_progress_signature(step): step.pk for step in steps}
    latest_by_step = {}
    accepted_step_ids = set()
    submissions_by_step = {}
    submissions = Submission.objects.filter(enrollment=enrollment).select_related("step").order_by(
        "-created_at", "-attempt_number", "-pk"
    )
    for submission in submissions:
        current_step_id = current_step_by_signature.get(_step_progress_signature(submission.step))
        if current_step_id is None:
            # The course step changed; its old submissions stay in history but do not
            # complete the new version of the task.
            continue
        latest_by_step.setdefault(current_step_id, submission)
        submissions_by_step.setdefault(current_step_id, []).append(submission)
        if submission.status == Submission.Status.ACCEPTED:
            accepted_step_ids.add(current_step_id)
    return steps, latest_by_step, accepted_step_ids, submissions_by_step


def related_step_revision_ids(enrollment, step, *, include_submissions):
    """Return historical versions of the same logical step for this enrollment."""
    if include_submissions:
        related_step_ids = Submission.objects.filter(enrollment=enrollment).values_list("step_id", flat=True).distinct()
    else:
        related_step_ids = StepQuestion.objects.filter(enrollment=enrollment).values_list("step_id", flat=True).distinct()
    step_ids = {step.pk}
    historical_steps = StepRevision.objects.filter(pk__in=related_step_ids).only(
        "id", "source_id", "source_draft_step_id", "type_key", "schema_version", "content", "max_score"
    )
    for historical_step in historical_steps:
        if _step_identity(historical_step) == _step_identity(step):
            step_ids.add(historical_step.pk)
    return step_ids


def sync_enrollments_to_revision(*, course_id, revision):
    """Move every current student assignment to the newly published course revision."""
    enrollments = list(
        Enrollment.objects.select_for_update()
        .select_related("revision")
        .filter(revision__course_id=course_id)
        .exclude(status=Enrollment.Status.REMOVED)
        .order_by("student_id", "-assigned_at", "-pk")
    )
    grouped = {}
    for enrollment in enrollments:
        grouped.setdefault(enrollment.student_id, []).append(enrollment)

    for student_enrollments in grouped.values():
        # If the student already has assignments from multiple published versions,
        # keep one visible course entry and retain the rest as removed history.
        canonical = max(
            student_enrollments,
            key=lambda item: (item.assigned_at, str(item.pk)),
        )
        duplicates = [item for item in student_enrollments if item.pk != canonical.pk]
        if duplicates:
            duplicate_ids = [item.pk for item in duplicates]
            Submission.objects.filter(enrollment_id__in=duplicate_ids).update(enrollment=canonical)
            StepQuestion.objects.filter(enrollment_id__in=duplicate_ids).update(enrollment=canonical)
            Enrollment.objects.filter(pk__in=duplicate_ids).update(status=Enrollment.Status.REMOVED)

        previous_status = canonical.status
        if any(item.status == Enrollment.Status.ACTIVE for item in student_enrollments):
            canonical.status = Enrollment.Status.ACTIVE
        elif any(item.status == Enrollment.Status.PAUSED for item in student_enrollments):
            canonical.status = Enrollment.Status.PAUSED
        canonical.revision = revision
        canonical.save(update_fields=("revision", "status", "updated_at"))

        if previous_status == Enrollment.Status.COMPLETED and canonical.status == Enrollment.Status.COMPLETED:
            _, _, accepted_step_ids, _ = step_submission_state(canonical)
            if len(accepted_step_ids) < revision.steps.count():
                canonical.status = Enrollment.Status.ACTIVE
                canonical.save(update_fields=("status", "updated_at"))


def step_is_unlocked(enrollment, step):
    """A step is available only after every earlier step has been accepted."""
    if step.revision_id != enrollment.revision_id:
        return False
    previous_step_ids = list(
        enrollment.revision.steps.filter(position__lt=step.position).values_list("id", flat=True)
    )
    if not previous_step_ids:
        return True
    _, _, accepted_step_ids, _ = step_submission_state(enrollment)
    accepted_step_ids.intersection_update(previous_step_ids)
    return len(accepted_step_ids) == len(previous_step_ids)


def build_progress(enrollment):
    steps, by_step, accepted_step_ids, _ = step_submission_state(enrollment)

    total_steps = len(steps)
    completed_steps = len(accepted_step_ids)
    available_points = sum(step.max_score for step in steps)
    earned_points = sum(step.max_score for step in steps if step.id in accepted_step_ids)
    step_rows = []
    first_unaccepted = None
    previous_steps_accepted = True

    for step in steps:
        latest = by_step.get(step.id)
        unlocked = previous_steps_accepted
        accepted = step.id in accepted_step_ids
        if accepted:
            step_status = Submission.Status.ACCEPTED
            points = step.max_score
        else:
            step_status = latest.status if latest else "not_started"
            points = 0
            if first_unaccepted is None:
                first_unaccepted = (step, step_status)
            previous_steps_accepted = False
        step_rows.append(
            {
                "step_id": step.id,
                "title": step.title,
                "status": step_status,
                "unlocked": unlocked,
                "earned_points": points,
                "max_points": step.max_score,
            }
        )

    if completed_steps == total_steps and total_steps:
        next_step_id, next_action = None, "course_complete"
    elif first_unaccepted:
        step, latest_status = first_unaccepted
        next_step_id = step.id
        if latest_status in ACTIVE_STATUSES:
            next_action = "await_review"
        elif latest_status == Submission.Status.RETURNED:
            next_action = "revise_submission"
        else:
            next_action = "complete_step"
    else:
        next_step_id, next_action = None, "course_complete"

    return {
        "completed_steps": completed_steps,
        "total_steps": total_steps,
        "earned_points": earned_points,
        "available_points": available_points,
        "completion_percent": math.floor(100 * completed_steps / total_steps) if total_steps else 0,
        "rating_percent": math.floor(100 * earned_points / available_points) if available_points else 0,
        "next_step_id": next_step_id,
        "next_action": next_action,
        "steps": step_rows,
    }
