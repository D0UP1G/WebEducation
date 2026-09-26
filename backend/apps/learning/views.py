from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from config.pagination import ContractPagination
from config.permissions import IsStudent
from config.responses import data_response
from .models import Enrollment
from .serializers import PublicStepSerializer, StudentCourseListSerializer, StudentEnrollmentSerializer
from .services import build_course_rating, build_progress, step_is_unlocked


class StudentApiView(APIView):
    permission_classes = [IsStudent]

    def enrollment(self, request, enrollment_id):
        return get_object_or_404(
            Enrollment.objects.select_related("revision", "revision__course").prefetch_related(
                "revision__steps", "submissions"
            ),
            pk=enrollment_id,
            student=request.user,
            status__in=(Enrollment.Status.ACTIVE, Enrollment.Status.PAUSED, Enrollment.Status.COMPLETED),
        )


class StudentCourseListView(StudentApiView):
    def get(self, request):
        queryset = (
            Enrollment.objects.filter(student=request.user).exclude(status=Enrollment.Status.REMOVED)
            .select_related("revision", "revision__course")
            .prefetch_related("revision__steps", "submissions")
        )
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(StudentCourseListSerializer(page, many=True).data)


class StudentEnrollmentView(StudentApiView):
    def get(self, request, enrollment_id):
        enrollment = self.enrollment(request, enrollment_id)
        return data_response(request, StudentEnrollmentSerializer(enrollment).data)


class StudentProgressView(StudentApiView):
    def get(self, request, enrollment_id):
        return data_response(request, build_progress(self.enrollment(request, enrollment_id)))


class StudentCourseRatingView(StudentApiView):
    def get(self, request, enrollment_id):
        return data_response(request, build_course_rating(self.enrollment(request, enrollment_id)))


class StudentStepView(StudentApiView):
    def get(self, request, enrollment_id, step_id):
        enrollment = self.enrollment(request, enrollment_id)
        step = get_object_or_404(enrollment.revision.steps, pk=step_id)
        if not step_is_unlocked(enrollment, step):
            from rest_framework.exceptions import NotFound
            raise NotFound("Сначала завершите предыдущие шаги курса")
        return data_response(request, PublicStepSerializer(step).data)
