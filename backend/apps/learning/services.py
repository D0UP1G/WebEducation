import math

from .models import Submission


ACTIVE_STATUSES = {Submission.Status.QUEUED, Submission.Status.CHECKING, Submission.Status.PENDING_REVIEW}


def step_is_unlocked(enrollment, step):
    """A step is available only after every earlier step has been accepted."""
    if step.revision_id != enrollment.revision_id:
        return False
    previous_step_ids = list(
        enrollment.revision.steps.filter(position__lt=step.position).values_list("id", flat=True)
    )
    if not previous_step_ids:
        return True
    accepted_step_ids = set(
        enrollment.submissions.filter(
            step_id__in=previous_step_ids, status=Submission.Status.ACCEPTED
        ).values_list("step_id", flat=True)
    )
    return len(accepted_step_ids) == len(previous_step_ids)


def build_progress(enrollment):
    steps = list(enrollment.revision.steps.order_by("position"))
    submissions = list(enrollment.submissions.select_related("step").order_by("step_id", "-attempt_number"))
    by_step = {}
    accepted_step_ids = set()
    for submission in submissions:
        by_step.setdefault(submission.step_id, submission)
        if submission.status == Submission.Status.ACCEPTED:
            accepted_step_ids.add(submission.step_id)

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
