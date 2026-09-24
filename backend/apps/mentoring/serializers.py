from rest_framework import serializers

from apps.accounts.serializers import CurrentUserSerializer
from apps.courses.models import StepRevision
from apps.courses.step_types import curator_step_content, public_step_content
from apps.grading.serializers import SubmissionSerializer, StrictSerializer
from apps.learning.models import StepQuestion, Submission


class StepSummarySerializer(serializers.ModelSerializer):
    content = serializers.SerializerMethodField()

    class Meta:
        model = StepRevision
        fields = ("id", "title", "type_key", "schema_version", "position", "content", "max_score")

    def get_content(self, obj):
        return public_step_content(obj.type_key, obj.schema_version, obj.content)


class CuratorReviewStepSerializer(StepSummarySerializer):
    def get_content(self, obj):
        return curator_step_content(obj.type_key, obj.schema_version, obj.content)


class QuestionSerializer(serializers.ModelSerializer):
    student = CurrentUserSerializer(read_only=True)
    step = StepSummarySerializer(read_only=True)
    enrollment_id = serializers.UUIDField(read_only=True)
    course_title = serializers.CharField(source="enrollment.revision.title", read_only=True)

    class Meta:
        model = StepQuestion
        fields = ("id", "enrollment_id", "course_title", "student", "step", "question", "answer", "created_at", "answered_at")


class ReviewQueueSerializer(serializers.ModelSerializer):
    submission_id = serializers.UUIDField(source="id", read_only=True)
    student = CurrentUserSerializer(read_only=True)
    step = CuratorReviewStepSerializer(read_only=True)
    course_title = serializers.CharField(source="enrollment.revision.title", read_only=True)

    class Meta:
        model = Submission
        fields = ("id", "submission_id", "student", "step", "course_title", "status", "created_at")


class CuratorAttemptSerializer(SubmissionSerializer):
    def get_download_url(self, obj):
        if not obj.artifact_file:
            return None
        request = self.context.get("request")
        path = f"/api/v1/curator/submissions/{obj.pk}/artifact"
        return request.build_absolute_uri(path) if request else path


class CuratorSubmissionSerializer(CuratorAttemptSerializer):
    student = CurrentUserSerializer(read_only=True)
    step = CuratorReviewStepSerializer(read_only=True)
    course_title = serializers.CharField(source="enrollment.revision.title", read_only=True)
    attempts = serializers.SerializerMethodField()

    class Meta(SubmissionSerializer.Meta):
        fields = SubmissionSerializer.Meta.fields + ("student", "step", "course_title", "attempts")

    def get_attempts(self, obj):
        history = Submission.objects.filter(enrollment=obj.enrollment, step=obj.step).select_related("step").order_by("-attempt_number")
        return CuratorAttemptSerializer(history, many=True, context=self.context).data


class ReviewInput(StrictSerializer):
    decision = serializers.ChoiceField(choices=["accepted", "returned"])
    comment = serializers.CharField(allow_blank=True, required=False, default="", max_length=5000)


class QuestionInput(StrictSerializer):
    question = serializers.CharField(allow_blank=False, max_length=5000)


class AnswerInput(StrictSerializer):
    answer = serializers.CharField(allow_blank=False, max_length=5000)
