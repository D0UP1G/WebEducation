from rest_framework import serializers

from apps.courses.models import ModuleRevision, StepRevision
from apps.courses.step_types import public_step_content
from .models import Enrollment
from .services import build_progress


class PublicStepSerializer(serializers.ModelSerializer):
    content = serializers.SerializerMethodField()

    class Meta:
        model = StepRevision
        fields = ("id", "type_key", "schema_version", "position", "title", "content", "max_score")

    def get_content(self, obj):
        return public_step_content(obj.type_key, obj.schema_version, obj.content)


class PublicModuleSerializer(serializers.ModelSerializer):
    steps = PublicStepSerializer(many=True, read_only=True)

    class Meta:
        model = ModuleRevision
        fields = ("id", "source_id", "position", "title", "steps")


class StudentEnrollmentSerializer(serializers.ModelSerializer):
    course_id = serializers.UUIDField(source="revision.course_id", read_only=True)
    course_revision_id = serializers.UUIDField(source="revision_id", read_only=True)
    version = serializers.IntegerField(source="revision.version", read_only=True)
    title = serializers.CharField(source="revision.title", read_only=True)
    description = serializers.CharField(source="revision.description", read_only=True)
    grade_min = serializers.IntegerField(source="revision.grade_min", read_only=True)
    grade_max = serializers.IntegerField(source="revision.grade_max", read_only=True)
    tool = serializers.CharField(source="revision.tool", read_only=True)
    goal = serializers.CharField(source="revision.goal", read_only=True)
    volume = serializers.CharField(source="revision.volume", read_only=True)
    steps = PublicStepSerializer(source="revision.steps", many=True, read_only=True)
    modules = PublicModuleSerializer(source="revision.modules", many=True, read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = (
            "id",
            "course_id",
            "course_revision_id",
            "version",
            "title",
            "description",
            "grade_min",
            "grade_max",
            "tool",
            "goal",
            "volume",
            "status",
            "assigned_at",
            "steps",
            "modules",
            "progress",
        )

    def get_progress(self, obj):
        return build_progress(obj)


class StudentCourseListSerializer(serializers.ModelSerializer):
    course_id = serializers.UUIDField(source="revision.course_id", read_only=True)
    version = serializers.IntegerField(source="revision.version", read_only=True)
    title = serializers.CharField(source="revision.title", read_only=True)
    description = serializers.CharField(source="revision.description", read_only=True)
    grade_min = serializers.IntegerField(source="revision.grade_min", read_only=True)
    grade_max = serializers.IntegerField(source="revision.grade_max", read_only=True)
    tool = serializers.CharField(source="revision.tool", read_only=True)
    goal = serializers.CharField(source="revision.goal", read_only=True)
    volume = serializers.CharField(source="revision.volume", read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = (
            "id",
            "course_id",
            "version",
            "title",
            "description",
            "grade_min",
            "grade_max",
            "tool",
            "goal",
            "volume",
            "status",
            "assigned_at",
            "progress",
        )

    def get_progress(self, obj):
        progress = build_progress(obj)
        return {key: value for key, value in progress.items() if key != "steps"}
