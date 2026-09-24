from collections.abc import Mapping
from urllib.parse import urlsplit

from rest_framework import serializers

from apps.learning.models import Submission


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        # Let DRF return its standard validation error for JSON null, arrays,
        # and other non-object request bodies before inspecting field names.
        if not isinstance(data, Mapping):
            return super().to_internal_value(data)
        unexpected = set(data) - set(self.fields)
        if unexpected:
            raise serializers.ValidationError({name: ["Лишнее поле"] for name in sorted(unexpected)})
        return super().to_internal_value(data)


class TheoryInput(StrictSerializer):
    action = serializers.ChoiceField(choices=["complete"])


class AnswerInput(StrictSerializer):
    answer = serializers.CharField(allow_blank=False, max_length=10000)


class MultipleChoiceInput(StrictSerializer):
    answer = serializers.ListField(
        child=serializers.CharField(allow_blank=False, max_length=1000), allow_empty=False, max_length=100
    )


class PythonChallengeInput(StrictSerializer):
    code = serializers.CharField(allow_blank=False, max_length=65536)


class PythonResultInput(StrictSerializer):
    id = serializers.IntegerField(min_value=0)
    stdout = serializers.CharField(allow_blank=True, trim_whitespace=False, max_length=65536)
    exit_code = serializers.IntegerField(min_value=0, max_value=255)
    duration_ms = serializers.IntegerField(min_value=0)
    peak_memory_bytes = serializers.IntegerField(min_value=0)


class PythonSubmissionInput(StrictSerializer):
    code = serializers.CharField(allow_blank=False, max_length=65536)
    challenge_token = serializers.CharField(allow_blank=False, max_length=2048)
    results = PythonResultInput(many=True, allow_empty=False)


class ArtifactInput(StrictSerializer):
    file = serializers.FileField(required=False)
    url = serializers.URLField(required=False, max_length=1000)
    explanation = serializers.CharField(required=False, allow_blank=True, max_length=5000)

    def validate(self, attrs):
        if "file" not in attrs and "url" not in attrs:
            raise serializers.ValidationError("Укажите файл или ссылку")
        if "url" in attrs:
            parts = urlsplit(attrs["url"])
            if parts.scheme not in {"http", "https"} or not parts.hostname:
                raise serializers.ValidationError({"url": ["Нужна ссылка http или https"]})
        return attrs


INPUTS = {
    "theory": TheoryInput,
    "quiz.single_choice": AnswerInput,
    "quiz.multiple_choice": MultipleChoiceInput,
    "answer.exact": AnswerInput,
    "algorithm.python": PythonSubmissionInput,
    "artifact.scratch": ArtifactInput,
    "artifact.minecraft": ArtifactInput,
}


class SubmissionSerializer(serializers.ModelSerializer):
    step_id = serializers.UUIDField(read_only=True)
    max_score = serializers.IntegerField(source="step.max_score", read_only=True)
    download_url = serializers.SerializerMethodField()
    explanation = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = ("id", "step_id", "status", "attempt_number", "score", "max_score", "feedback",
                  "safe_diagnostics", "artifact_url", "download_url", "explanation", "created_at")

    def get_explanation(self, obj):
        return obj.payload.get("explanation", "")

    def get_download_url(self, obj):
        if not obj.artifact_file:
            return None
        request = self.context.get("request")
        path = f"/api/v1/student/submissions/{obj.pk}/artifact"
        return request.build_absolute_uri(path) if request else path
