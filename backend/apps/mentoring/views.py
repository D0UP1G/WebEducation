from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound

from apps.accounts.models import User
from apps.learning.models import Enrollment, StepQuestion, Submission
from apps.learning.services import build_progress
from config.pagination import ContractPagination
from config.permissions import IsCurator
from config.responses import data_response
from .serializers import AnswerInput, CuratorSubmissionSerializer, QuestionSerializer, ReviewInput, ReviewQueueSerializer
from .services import decide_review, lag_signals


class CuratorApiView(APIView):
    permission_classes = [IsCurator]


class CuratorStudentsView(CuratorApiView):
    def get(self, request):
        students = User.objects.filter(student_enrollments__curator=request.user).distinct().order_by("display_name", "pk")
        paginator = ContractPagination()
        page = paginator.paginate_queryset(students, request, view=self)
        rows = {student.pk: {"id": student.pk, "display_name": student.display_name,
                             "role": student.role, "lag_signals": [], "enrollments": []} for student in page}
        enrollments = Enrollment.objects.filter(curator=request.user, student_id__in=rows).select_related(
            "student", "revision"
        ).prefetch_related("revision__steps", "submissions").order_by("student__display_name", "student_id", "-assigned_at")
        for enrollment in enrollments:
            row = rows[enrollment.student_id]
            progress = build_progress(enrollment)
            row["enrollments"].append({"id": enrollment.pk, "title": enrollment.revision.title, "progress": progress})
            row["lag_signals"].extend(lag_signals(enrollment))
            if "progress" not in row:
                row["progress"] = progress
        return paginator.get_paginated_response(list(rows.values()))


class CuratorStudentProgressView(CuratorApiView):
    def get(self, request, student_id, enrollment_id):
        enrollment = get_object_or_404(Enrollment.objects.select_related("revision").prefetch_related("revision__steps", "submissions"),
                                       pk=enrollment_id, student_id=student_id, curator=request.user)
        return data_response(request, {**build_progress(enrollment), "lag_signals": lag_signals(enrollment)})


class CuratorReviewListView(CuratorApiView):
    def get(self, request):
        status = request.query_params.get("status", "pending_review")
        if status != "pending_review":
            from rest_framework import serializers
            raise serializers.ValidationError({"status": ["Доступна очередь pending_review"]})
        queryset = Submission.objects.filter(enrollment__curator=request.user, status=Submission.Status.PENDING_REVIEW).select_related(
            "student", "step", "enrollment__revision"
        ).order_by("created_at")
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(ReviewQueueSerializer(page, many=True).data)


class CuratorSubmissionView(CuratorApiView):
    def get_submission(self, request, submission_id):
        return get_object_or_404(Submission.objects.select_related("student", "step", "enrollment__revision"),
                                 pk=submission_id, enrollment__curator=request.user)

    def get(self, request, submission_id):
        submission = self.get_submission(request, submission_id)
        return data_response(request, CuratorSubmissionSerializer(submission, context={"request": request}).data)


class CuratorArtifactView(CuratorSubmissionView):
    def get(self, request, submission_id):
        submission = self.get_submission(request, submission_id)
        if not submission.artifact_file:
            raise NotFound()
        return FileResponse(submission.artifact_file.open("rb"), as_attachment=True)


class CuratorDecisionView(CuratorSubmissionView):
    def post(self, request, submission_id):
        form = ReviewInput(data=request.data)
        form.is_valid(raise_exception=True)
        self.get_submission(request, submission_id)
        submission = decide_review(submission_id=submission_id, curator=request.user, **form.validated_data)
        return data_response(request, CuratorSubmissionSerializer(submission, context={"request": request}).data)


class CuratorQuestionsView(CuratorApiView):
    def get(self, request):
        status = request.query_params.get("status", "unanswered")
        queryset = StepQuestion.objects.filter(enrollment__curator=request.user).select_related(
            "student", "step", "enrollment__revision"
        )
        if status == "unanswered":
            queryset = queryset.filter(answered_at__isnull=True)
        elif status == "answered":
            queryset = queryset.filter(answered_at__isnull=False)
        else:
            from rest_framework import serializers
            raise serializers.ValidationError({"status": ["Используйте unanswered или answered"]})
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(QuestionSerializer(page, many=True).data)


class CuratorAnswerView(CuratorApiView):
    def post(self, request, question_id):
        form = AnswerInput(data=request.data)
        form.is_valid(raise_exception=True)
        with transaction.atomic():
            question = get_object_or_404(StepQuestion.objects.select_for_update(), pk=question_id,
                                         enrollment__curator=request.user)
            if question.answered_at:
                from apps.grading.services import Conflict
                raise Conflict("На вопрос уже ответили")
            from django.utils import timezone
            question.answer = form.validated_data["answer"]
            question.answered_by = request.user
            question.answered_at = timezone.now()
            question.save(update_fields=("answer", "answered_by", "answered_at", "updated_at"))
        return data_response(request, QuestionSerializer(question).data)
