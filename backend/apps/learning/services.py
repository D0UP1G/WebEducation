import math

from .models import Submission


ACTIVE_STATUSES = {Submission.Status.QUEUED, Submission.Status.CHECKING, Submission.Status.PENDING_REVIEW}


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
    first_available = None
    has_waiting = False

    for step in steps:
        latest = by_step.get(step.id)
        if step.id in accepted_step_ids:
            step_status = Submission.Status.ACCEPTED
            points = step.max_score
        else:
            step_status = latest.status if latest else "not_started"
            points = 0
            if step_status in ACTIVE_STATUSES:
                has_waiting = True
            elif first_available is None:
                first_available = (step, step_status)
        step_rows.append(
            {
                "step_id": step.id,
                "title": step.title,
                "status": step_status,
                "earned_points": points,
                "max_points": step.max_score,
            }
        )

    if completed_steps == total_steps and total_steps:
        next_step_id, next_action = None, "course_complete"
    elif first_available:
        step, latest_status = first_available
        next_step_id = step.id
        next_action = "revise_submission" if latest_status == Submission.Status.RETURNED else "complete_step"
    elif has_waiting:
        next_step_id, next_action = None, "await_review"
    else:
        next_step_id, next_action = None, "complete_step"

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

