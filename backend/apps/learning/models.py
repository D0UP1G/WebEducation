import uuid

from django.conf import settings
from django.db import models

from apps.courses.models import CourseRevision, StepRevision, TimeStampedModel


class Enrollment(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Активно"
        PAUSED = "paused", "Приостановлено"
        COMPLETED = "completed", "Завершено"
        REMOVED = "removed", "Снято"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    revision = models.ForeignKey(CourseRevision, on_delete=models.PROTECT, related_name="enrollments")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="student_enrollments")
    curator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="curated_enrollments")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-assigned_at",)
        constraints = [models.UniqueConstraint(fields=("revision", "student"), name="unique_student_revision_enrollment")]


class Submission(TimeStampedModel):
    class Status(models.TextChoices):
        QUEUED = "queued", "В очереди"
        CHECKING = "checking", "Проверяется"
        PENDING_REVIEW = "pending_review", "Ожидает куратора"
        ACCEPTED = "accepted", "Принято"
        INCORRECT = "incorrect", "Неверно"
        RETURNED = "returned", "Возвращено"
        ERROR = "error", "Ошибка проверки"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enrollment = models.ForeignKey(Enrollment, on_delete=models.PROTECT, related_name="submissions")
    step = models.ForeignKey(StepRevision, on_delete=models.PROTECT, related_name="submissions")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="submissions")
    attempt_number = models.PositiveIntegerField()
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED)
    payload = models.JSONField(default=dict)
    artifact_file = models.FileField(upload_to="submissions/%Y/%m/", null=True, blank=True)
    artifact_url = models.URLField(max_length=1000, blank=True)
    score = models.PositiveIntegerField(null=True, blank=True)
    feedback = models.TextField(blank=True)
    safe_diagnostics = models.JSONField(default=dict, blank=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    idempotency_scope = models.CharField(max_length=255, blank=True)
    request_hash = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=("enrollment", "step", "attempt_number"), name="unique_submission_attempt"),
            models.UniqueConstraint(
                fields=("student", "idempotency_scope", "idempotency_key"),
                condition=~models.Q(idempotency_key=""),
                name="unique_submission_idempotency_key",
            ),
        ]


class Review(TimeStampedModel):
    class Decision(models.TextChoices):
        ACCEPTED = "accepted", "Принято"
        RETURNED = "returned", "Возвращено"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    submission = models.OneToOneField(Submission, on_delete=models.PROTECT, related_name="review")
    curator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reviews")
    decision = models.CharField(max_length=16, choices=Decision.choices)
    comment = models.TextField(blank=True)


class StepQuestion(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enrollment = models.ForeignKey(Enrollment, on_delete=models.PROTECT, related_name="questions")
    step = models.ForeignKey(StepRevision, on_delete=models.PROTECT, related_name="questions")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="step_questions")
    question = models.TextField()
    answer = models.TextField(blank=True)
    answered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="answered_step_questions", null=True, blank=True
    )
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)


class StepQuestionMessage(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.ForeignKey(StepQuestion, on_delete=models.PROTECT, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="step_question_messages")
    body = models.TextField()

    class Meta:
        ordering = ("created_at", "id")
