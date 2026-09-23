from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.learning.models import Review, Submission
from apps.grading.services import Conflict


@transaction.atomic
def decide_review(*, submission_id, curator, decision, comment):
    submission = Submission.objects.select_for_update().select_related("enrollment", "step").get(pk=submission_id)
    if submission.enrollment.curator_id != curator.pk:
        from rest_framework.exceptions import NotFound
        raise NotFound()
    if submission.status != Submission.Status.PENDING_REVIEW:
        raise Conflict("Эта работа уже проверена")
    if decision == Review.Decision.RETURNED and not comment.strip():
        raise serializers.ValidationError({"comment": ["При возврате нужен комментарий"]})
    Review.objects.create(submission=submission, curator=curator, decision=decision, comment=comment)
    submission.status = Submission.Status.ACCEPTED if decision == Review.Decision.ACCEPTED else Submission.Status.RETURNED
    submission.score = submission.step.max_score if decision == Review.Decision.ACCEPTED else 0
    submission.feedback = comment
    submission.save(update_fields=("status", "score", "feedback", "updated_at"))
    return submission


def lag_signals(enrollment, now=None):
    now = now or timezone.now()
    submissions = sorted(enrollment.submissions.all(), key=lambda item: (item.created_at, item.attempt_number))
    accepted = [item for item in submissions if item.status == Submission.Status.ACCEPTED]
    last_credit = max((item.created_at for item in accepted), default=enrollment.assigned_at)
    signals = []
    incomplete = len({item.step_id for item in accepted}) < enrollment.revision.steps.count()
    if enrollment.status == "active" and incomplete and now - last_credit >= timedelta(hours=72):
        signals.append({"code": "no_credit_72h", "reason": "Нет зачёта 72 часа", "since": last_credit.isoformat()})
    recent_incorrect = {}
    for item in submissions:
        if item.status == Submission.Status.INCORRECT and now - item.created_at <= timedelta(hours=24):
            recent_incorrect.setdefault(item.step_id, []).append(item)
    for step_id, attempts in recent_incorrect.items():
        resolved = any(item.step_id == step_id and item.status == Submission.Status.ACCEPTED for item in submissions)
        if len(attempts) >= 2 and not resolved:
            signals.append({"code": "two_incorrect_24h", "reason": "Две неверные попытки за 24 часа",
                            "step_id": str(step_id), "since": attempts[0].created_at.isoformat()})
    latest_by_step = {}
    for item in submissions:
        latest_by_step[item.step_id] = item
    for step_id, item in latest_by_step.items():
        if item.status == Submission.Status.RETURNED and now - item.updated_at >= timedelta(hours=24):
            signals.append({"code": "returned_no_retry_24h", "reason": "Работа возвращена без пересдачи 24 часа",
                            "step_id": str(step_id), "since": item.updated_at.isoformat()})
    return signals
