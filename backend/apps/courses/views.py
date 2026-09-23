from django.db.models import Count
from django.shortcuts import get_object_or_404
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
    UserOptionSerializer,
    step_type_catalog,
)
from .services import publish_course
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
                "title": course.title,
                "description": course.description,
                "grade_min": course.grade_min,
                "grade_max": course.grade_max,
                "steps": steps,
            },
        )


class DraftStepCreateView(AdminApiView):
    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        serializer = DraftStepSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        step = serializer.save(course=course)
        return data_response(request, DraftStepSerializer(step).data, status=status.HTTP_201_CREATED)


class DraftStepDetailView(AdminApiView):
    def get_object(self, course_id, step_id):
        return get_object_or_404(DraftStep, pk=step_id, course_id=course_id)

    def patch(self, request, course_id, step_id):
        step = self.get_object(course_id, step_id)
        serializer = DraftStepSerializer(step, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return data_response(request, serializer.data)

    def delete(self, request, course_id, step_id):
        self.get_object(course_id, step_id).delete()
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
        queryset = User.objects.filter(role=role, is_active=True).order_by("display_name")
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(UserOptionSerializer(page, many=True).data)


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

