from rest_framework import serializers

from apps.accounts.models import User
from apps.learning.models import Enrollment
from .models import Course, CourseRevision, DraftStep, StepRevision
from .step_types import STEP_TYPES, public_step_content, validate_step_content


class DraftStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = DraftStep
        fields = ("id", "type_key", "schema_version", "position", "title", "content", "max_score")
        read_only_fields = ("id",)

    def validate(self, attrs):
        instance = self.instance
        type_key = attrs.get("type_key", getattr(instance, "type_key", None))
        schema_version = attrs.get("schema_version", getattr(instance, "schema_version", 1))
        content = attrs.get("content", getattr(instance, "content", None))
        validate_step_content(type_key, schema_version, content)
        return attrs


class CourseListSerializer(serializers.ModelSerializer):
    latest_version = serializers.IntegerField(source="latest_revision.version", read_only=True, allow_null=True)
    draft_steps_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Course
        fields = ("id", "title", "description", "grade_min", "grade_max", "latest_version", "draft_steps_count")


class CourseDetailSerializer(serializers.ModelSerializer):
    draft_steps = DraftStepSerializer(many=True, read_only=True)
    latest_version = serializers.IntegerField(source="latest_revision.version", read_only=True, allow_null=True)

    class Meta:
        model = Course
        fields = (
            "id",
            "title",
            "description",
            "grade_min",
            "grade_max",
            "latest_version",
            "draft_steps",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "latest_version", "draft_steps", "created_at", "updated_at")

    def validate(self, attrs):
        minimum = attrs.get("grade_min", getattr(self.instance, "grade_min", 1))
        maximum = attrs.get("grade_max", getattr(self.instance, "grade_max", 9))
        if minimum > maximum:
            raise serializers.ValidationError({"grade_max": ["Максимальный класс не может быть меньше минимального"]})
        return attrs


class RevisionStepSerializer(serializers.ModelSerializer):
    content = serializers.SerializerMethodField()

    class Meta:
        model = StepRevision
        fields = ("id", "type_key", "schema_version", "position", "title", "content", "max_score")

    def get_content(self, obj):
        return public_step_content(obj.type_key, obj.schema_version, obj.content)


class CourseRevisionSerializer(serializers.ModelSerializer):
    steps = RevisionStepSerializer(many=True, read_only=True)

    class Meta:
        model = CourseRevision
        fields = ("id", "version", "title", "description", "grade_min", "grade_max", "published_at", "steps")


class UserOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "display_name", "role")


class EnrollmentAdminSerializer(serializers.ModelSerializer):
    student = UserOptionSerializer(read_only=True)
    curator = UserOptionSerializer(read_only=True)
    revision = CourseRevisionSerializer(read_only=True)
    student_id = serializers.PrimaryKeyRelatedField(
        source="student", queryset=User.objects.filter(role=User.Role.STUDENT), write_only=True
    )
    curator_id = serializers.PrimaryKeyRelatedField(
        source="curator", queryset=User.objects.filter(role=User.Role.CURATOR), write_only=True
    )
    course_id = serializers.PrimaryKeyRelatedField(
        source="course", queryset=Course.objects.filter(latest_revision__isnull=False), write_only=True
    )

    class Meta:
        model = Enrollment
        fields = (
            "id",
            "revision",
            "student",
            "curator",
            "status",
            "assigned_at",
            "student_id",
            "curator_id",
            "course_id",
        )
        read_only_fields = ("id", "revision", "student", "curator", "assigned_at")

    def create(self, validated_data):
        course = validated_data.pop("course")
        validated_data["revision"] = course.latest_revision
        return super().create(validated_data)

    def validate(self, attrs):
        if self.instance and ("student" in attrs or "course" in attrs):
            raise serializers.ValidationError({"enrollment": ["Можно изменить только куратора или статус"]})
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("course", None)
        validated_data.pop("student", None)
        return super().update(instance, validated_data)


def step_type_catalog():
    return [
        {
            "type_key": item.type_key,
            "schema_version": item.schema_version,
            "title": item.title,
            "checking_mode": item.checking_mode,
        }
        for item in STEP_TYPES.values()
    ]
