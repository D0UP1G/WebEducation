from pathlib import Path

from rest_framework import serializers

from apps.accounts.models import User
from apps.learning.models import Enrollment
from .models import Course, CourseRevision, DraftStep, Module, ModuleRevision, StepRevision
from .services import assign_enrollment
from .step_types import STEP_TYPES, public_step_content, validate_step_content


class DraftStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = DraftStep
        fields = ("id", "source_id", "module", "type_key", "schema_version", "position", "title", "content", "max_score")
        read_only_fields = ("id", "source_id", "module")
        extra_kwargs = {"position": {"required": False}}

    def validate(self, attrs):
        instance = self.instance
        type_key = attrs.get("type_key", getattr(instance, "type_key", None))
        schema_version = attrs.get("schema_version", getattr(instance, "schema_version", 1))
        content = attrs.get("content", getattr(instance, "content", None))
        validate_step_content(type_key, schema_version, content)
        if attrs.get("max_score", getattr(instance, "max_score", 1)) < 1:
            raise serializers.ValidationError({"max_score": ["Баллы должны быть положительными"]})
        return attrs


class ModuleSerializer(serializers.ModelSerializer):
    draft_steps = DraftStepSerializer(many=True, read_only=True)

    class Meta:
        model = Module
        fields = ("id", "source_id", "position", "title", "draft_steps")


def get_banner_url(obj):
    return obj.banner_image.url if obj.banner_image else None


class CourseListSerializer(serializers.ModelSerializer):
    latest_version = serializers.IntegerField(source="latest_revision.version", read_only=True, allow_null=True)
    draft_steps_count = serializers.IntegerField(read_only=True)
    banner_url = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = (
            "id",
            "source_id",
            "title",
            "description",
            "grade_min",
            "grade_max",
            "tool",
            "goal",
            "volume",
            "banner_url",
            "is_archived",
            "latest_version",
            "draft_steps_count",
        )

    def get_banner_url(self, obj):
        return get_banner_url(obj)


class CourseDetailSerializer(serializers.ModelSerializer):
    draft_steps = DraftStepSerializer(many=True, read_only=True)
    modules = ModuleSerializer(many=True, read_only=True)
    latest_version = serializers.IntegerField(source="latest_revision.version", read_only=True, allow_null=True)
    banner_url = serializers.SerializerMethodField()
    banner_image = serializers.FileField(required=False, allow_null=True, write_only=True)
    clear_banner = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = Course
        fields = (
            "id",
            "source_id",
            "title",
            "description",
            "grade_min",
            "grade_max",
            "tool",
            "goal",
            "volume",
            "banner_url",
            "is_archived",
            "banner_image",
            "clear_banner",
            "latest_version",
            "draft_steps",
            "modules",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "source_id",
            "latest_version",
            "draft_steps",
            "modules",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        if attrs.get("clear_banner") and attrs.get("banner_image"):
            raise serializers.ValidationError({"banner_image": ["Выберите новый баннер или уберите текущий"]})
        minimum = attrs.get("grade_min", getattr(self.instance, "grade_min", 1))
        maximum = attrs.get("grade_max", getattr(self.instance, "grade_max", 9))
        if minimum > maximum:
            raise serializers.ValidationError({"grade_max": ["Максимальный класс не может быть меньше минимального"]})
        return attrs

    def validate_banner_image(self, value):
        if value is None:
            return value
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Баннер слишком большой. Максимальный размер — 5 МБ.")
        suffix = Path(value.name).suffix.lower()
        prefix = value.read(12)
        value.seek(0)
        valid = {
            ".png": prefix.startswith(b"\x89PNG\r\n\x1a\n"),
            ".jpg": prefix.startswith(b"\xff\xd8\xff"),
            ".jpeg": prefix.startswith(b"\xff\xd8\xff"),
            ".webp": prefix[:4] == b"RIFF" and prefix[8:12] == b"WEBP",
        }
        if suffix not in valid or not valid[suffix]:
            raise serializers.ValidationError("Неверный формат баннера. Поддерживаются PNG, JPG и WEBP, до 5 МБ.")
        return value

    def get_banner_url(self, obj):
        return get_banner_url(obj)

    def create(self, validated_data):
        validated_data.pop("clear_banner", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if validated_data.pop("clear_banner", False):
            instance.banner_image = ""
        return super().update(instance, validated_data)


class RevisionStepSerializer(serializers.ModelSerializer):
    content = serializers.SerializerMethodField()

    class Meta:
        model = StepRevision
        fields = ("id", "source_id", "type_key", "schema_version", "position", "title", "content", "max_score")

    def get_content(self, obj):
        return public_step_content(obj.type_key, obj.schema_version, obj.content)


class ModuleRevisionSerializer(serializers.ModelSerializer):
    steps = RevisionStepSerializer(many=True, read_only=True)

    class Meta:
        model = ModuleRevision
        fields = ("id", "source_id", "position", "title", "steps")


class CourseRevisionSerializer(serializers.ModelSerializer):
    steps = RevisionStepSerializer(many=True, read_only=True)
    modules = ModuleRevisionSerializer(many=True, read_only=True)
    banner_url = serializers.SerializerMethodField()

    class Meta:
        model = CourseRevision
        fields = (
            "id",
            "source_id",
            "version",
            "title",
            "description",
            "grade_min",
            "grade_max",
            "tool",
            "goal",
            "volume",
            "banner_url",
            "published_at",
            "steps",
            "modules",
        )

    def get_banner_url(self, obj):
        return get_banner_url(obj)


class UserOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "display_name", "role")


class AdminUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "display_name", "role", "is_active", "is_deleted")


class AdminUserCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "display_name", "role")
        read_only_fields = ("id",)

    def validate_role(self, value):
        if value not in {User.Role.STUDENT, User.Role.CURATOR}:
            raise serializers.ValidationError("Можно создать только ученика или куратора")
        return value

    def create(self, validated_data):
        user = User(**validated_data)
        user.set_unusable_password()
        user.save()
        return user


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
        source="course", queryset=Course.objects.filter(latest_revision__isnull=False, is_archived=False), write_only=True
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
        if course.is_archived:
            raise serializers.ValidationError({"course_id": ["Архивный курс нельзя назначить. Сначала восстановите его."]})
        return assign_enrollment(course_id=course.id, **validated_data)

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
