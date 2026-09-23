import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Course(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    grade_min = models.PositiveSmallIntegerField(default=1)
    grade_max = models.PositiveSmallIntegerField(default=9)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_courses")
    latest_revision = models.ForeignKey(
        "CourseRevision", on_delete=models.SET_NULL, null=True, blank=True, related_name="latest_for_courses"
    )
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)

    def clean(self):
        if self.grade_min > self.grade_max:
            raise ValidationError({"grade_max": "Максимальный класс не может быть меньше минимального"})

    def __str__(self):
        return self.title


class DraftStep(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="draft_steps")
    type_key = models.CharField(max_length=64)
    schema_version = models.PositiveSmallIntegerField(default=1)
    position = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    content = models.JSONField(default=dict)
    max_score = models.PositiveIntegerField()

    class Meta:
        ordering = ("position", "created_at")
        constraints = [models.UniqueConstraint(fields=("course", "position"), name="unique_draft_step_position")]

    def __str__(self):
        return f"{self.course}: {self.position}. {self.title}"


class ImmutableRevisionModel(models.Model):
    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError("Опубликованная версия неизменяема")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Опубликованную версию нельзя удалить")


class CourseRevision(ImmutableRevisionModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="revisions")
    version = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    grade_min = models.PositiveSmallIntegerField()
    grade_max = models.PositiveSmallIntegerField()
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="published_revisions")
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-version",)
        constraints = [models.UniqueConstraint(fields=("course", "version"), name="unique_course_revision_version")]

    def __str__(self):
        return f"{self.title} v{self.version}"


class StepRevision(ImmutableRevisionModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    revision = models.ForeignKey(CourseRevision, on_delete=models.PROTECT, related_name="steps")
    source_draft_step_id = models.UUIDField()
    type_key = models.CharField(max_length=64)
    schema_version = models.PositiveSmallIntegerField(default=1)
    position = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    content = models.JSONField(default=dict)
    max_score = models.PositiveIntegerField()

    class Meta:
        ordering = ("position",)
        constraints = [models.UniqueConstraint(fields=("revision", "position"), name="unique_revision_step_position")]

    def __str__(self):
        return f"{self.revision}: {self.position}. {self.title}"

