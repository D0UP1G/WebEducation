from django.db.models import Count
from django.contrib.auth.tokens import default_token_generator
from django.shortcuts import get_object_or_404
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
import uuid
from rest_framework import serializers, status
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.learning.models import Enrollment
from config.pagination import ContractPagination
from config.permissions import IsAdmin
from config.responses import data_response
from .models import Course, DraftStep
from .serializers import (
    CourseDetailSerializer,
    CourseListSerializer,
    CourseRevisionSerializer,
    DraftStepSerializer,
    EnrollmentAdminSerializer,
    AdminUserCreateSerializer,
    AdminUserSerializer,
    step_type_catalog,
)
from .services import create_draft_step, delete_draft_step, publish_course, update_draft_step
from .step_types import public_step_content


class AdminApiView(APIView):
    permission_classes = [IsAdmin]


class CourseListCreateView(AdminApiView):
    def get(self, request):
        queryset = Course.objects.select_related("latest_revision").annotate(draft_steps_count=Count("draft_steps"))
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(CourseListSerializer(page, many=True).data)

    def post(self, request):
        serializer = CourseDetailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = serializer.save(owner=request.user)
        return data_response(request, CourseDetailSerializer(course).data, status=status.HTTP_201_CREATED)


class CourseDetailView(AdminApiView):
    def get_object(self, course_id):
        return get_object_or_404(Course.objects.prefetch_related("draft_steps"), pk=course_id)

    def get(self, request, course_id):
        return data_response(request, CourseDetailSerializer(self.get_object(course_id)).data)

    def patch(self, request, course_id):
        course = self.get_object(course_id)
        serializer = CourseDetailSerializer(course, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return data_response(request, serializer.data)

    def delete(self, request, course_id):
        course = self.get_object(course_id)
        has_published_history = course.revisions.exists()
        if has_published_history:
            course.is_archived = True
            course.save(update_fields=("is_archived", "updated_at"))
            return data_response(request, {"deleted": False, "archived": True})
        course.delete()
        return data_response(request, {"deleted": True, "archived": False})


class CoursePreviewView(AdminApiView):
    def get(self, request, course_id):
        course = get_object_or_404(Course.objects.prefetch_related("draft_steps"), pk=course_id)
        steps = [
            {
                "id": step.id,
                "type_key": step.type_key,
                "schema_version": step.schema_version,
                "position": step.position,
                "title": step.title,
                "content": public_step_content(step.type_key, step.schema_version, step.content),
                "max_score": step.max_score,
            }
            for step in course.draft_steps.all()
        ]
        return data_response(
            request,
            {
                "id": course.id,
                "source_id": course.source_id,
                "title": course.title,
                "description": course.description,
                "grade_min": course.grade_min,
                "grade_max": course.grade_max,
                "tool": course.tool,
                "goal": course.goal,
                "volume": course.volume,
                "banner_url": course.banner_image.url if course.banner_image else None,
                "steps": steps,
            },
        )


class DraftStepCreateView(AdminApiView):
    def post(self, request, course_id):
        get_object_or_404(Course, pk=course_id)
        serializer = DraftStepSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        step = create_draft_step(course_id=course_id, fields=dict(serializer.validated_data))
        return data_response(request, DraftStepSerializer(step).data, status=status.HTTP_201_CREATED)


class DraftStepDetailView(AdminApiView):
    def get_object(self, course_id, step_id):
        return get_object_or_404(DraftStep, pk=step_id, course_id=course_id)

    def patch(self, request, course_id, step_id):
        step = self.get_object(course_id, step_id)
        serializer = DraftStepSerializer(step, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        step = update_draft_step(course_id=course_id, step_id=step_id, fields=dict(serializer.validated_data))
        return data_response(request, DraftStepSerializer(step).data)

    def delete(self, request, course_id, step_id):
        self.get_object(course_id, step_id)
        delete_draft_step(course_id=course_id, step_id=step_id)
        return data_response(request, {"deleted": True})


class PublishCourseView(AdminApiView):
    def post(self, request, course_id):
        get_object_or_404(Course, pk=course_id)
        revision = publish_course(course_id=course_id, actor=request.user)
        return data_response(request, CourseRevisionSerializer(revision).data, status=status.HTTP_201_CREATED)


class CourseTypesView(AdminApiView):
    def get(self, request):
        return data_response(request, step_type_catalog())


class UserOptionsView(AdminApiView):
    def get(self, request):
        role = request.query_params.get("role")
        if role not in {User.Role.STUDENT, User.Role.CURATOR}:
            raise serializers.ValidationError({"role": ["Допустимы student или curator"]})
        queryset = User.objects.filter(role=role).order_by("display_name", "username")
        if request.query_params.get("include_inactive") != "1":
            queryset = queryset.filter(is_active=True, is_deleted=False)
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(AdminUserSerializer(page, many=True).data)

    def post(self, request):
        if set(request.data) - {"username", "display_name", "role"}:
            raise serializers.ValidationError({"user": ["Переданы неподдерживаемые поля"]})
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return data_response(request, {**AdminUserSerializer(user).data, "setup_url": self.password_setup_url(user)}, status=status.HTTP_201_CREATED)

    @staticmethod
    def password_setup_url(user):
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        return f"/set-password/{uid}/{token}"


class AdminUserDetailView(AdminApiView):
    def patch(self, request, user_id):
        if set(request.data) != {"is_active"}:
            raise serializers.ValidationError({"is_active": ["Можно изменить только статус учётной записи"]})
        user = get_object_or_404(User, pk=user_id, role__in=(User.Role.STUDENT, User.Role.CURATOR), is_deleted=False)
        if not isinstance(request.data["is_active"], bool):
            raise serializers.ValidationError({"is_active": ["Ожидается true или false"]})
        if not request.data["is_active"] and user.role == User.Role.CURATOR and Enrollment.objects.filter(
            curator=user, status=Enrollment.Status.ACTIVE
        ).exists():
            raise serializers.ValidationError({"is_active": ["Сначала переназначьте активные курсы куратора"]})
        user.is_active = request.data["is_active"]
        user.save(update_fields=["is_active"])
        return data_response(request, AdminUserSerializer(user).data)

    def delete(self, request, user_id):
        user = get_object_or_404(User, pk=user_id, role__in=(User.Role.STUDENT, User.Role.CURATOR), is_deleted=False)
        if user.role == User.Role.CURATOR and Enrollment.objects.filter(
            curator=user, status=Enrollment.Status.ACTIVE
        ).exists():
            raise serializers.ValidationError({"user": ["Сначала переназначьте активные курсы куратора"]})
        user.is_active = False
        user.is_deleted = True
        user.set_unusable_password()
        user.username = f"deleted-{uuid.uuid4().hex}"
        user.display_name = "Удалённый пользователь"
        user.email = ""
        user.first_name = ""
        user.last_name = ""
        user.save(update_fields=("is_active", "is_deleted", "password", "username", "display_name", "email", "first_name", "last_name"))
        return data_response(request, {"deleted": True})


class AdminUserPasswordLinkView(AdminApiView):
    def post(self, request, user_id):
        user = get_object_or_404(User, pk=user_id, role__in=(User.Role.STUDENT, User.Role.CURATOR), is_active=True, is_deleted=False)
        user.set_unusable_password()
        user.save(update_fields=("password",))
        return data_response(request, {"setup_url": UserOptionsView.password_setup_url(user)})


class EnrollmentListCreateView(AdminApiView):
    def get(self, request):
        queryset = Enrollment.objects.select_related("student", "curator", "revision", "revision__course")
        if course_id := request.query_params.get("course_id"):
            queryset = queryset.filter(revision__course_id=course_id)
        if student_id := request.query_params.get("student_id"):
            queryset = queryset.filter(student_id=student_id)
        if curator_id := request.query_params.get("curator_id"):
            queryset = queryset.filter(curator_id=curator_id)
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(EnrollmentAdminSerializer(page, many=True).data)

    def post(self, request):
        serializer = EnrollmentAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = serializer.save()
        return data_response(request, EnrollmentAdminSerializer(enrollment).data, status=status.HTTP_201_CREATED)


class EnrollmentDetailView(AdminApiView):
    def patch(self, request, enrollment_id):
        enrollment = get_object_or_404(Enrollment, pk=enrollment_id)
        serializer = EnrollmentAdminSerializer(enrollment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return data_response(request, serializer.data)
