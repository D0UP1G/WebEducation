from pathlib import Path

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.views import APIView

from apps.learning.models import Enrollment, StepQuestion, StepQuestionMessage, Submission
from apps.learning.services import related_step_revision_ids, step_is_unlocked
from apps.mentoring.serializers import QuestionInput, QuestionMessageInput, QuestionSerializer
from config.pagination import ContractPagination
from config.permissions import IsStudent
from config.responses import data_response
from .serializers import INPUTS, SubmissionSerializer
from .services import create_python_sample, create_submission


class StudentGradingView(APIView):
    permission_classes = [IsStudent]

    def get_enrollment_step(self, request, enrollment_id, step_id):
        enrollment = get_object_or_404(
            Enrollment.objects.select_related("revision"), pk=enrollment_id, student=request.user
        )
        if enrollment.status == Enrollment.Status.REMOVED:
            from rest_framework.exceptions import NotFound
            raise NotFound("Назначение курса снято")
        step = get_object_or_404(enrollment.revision.steps, pk=step_id)
        if not step_is_unlocked(enrollment, step):
            from rest_framework.exceptions import NotFound
            raise NotFound("Сначала завершите предыдущие шаги курса")
        return enrollment, step


class SubmissionListView(StudentGradingView):
    def get(self, request, enrollment_id, step_id):
        enrollment, step = self.get_enrollment_step(request, enrollment_id, step_id)
        queryset = Submission.objects.filter(
            enrollment=enrollment,
            step_id__in=related_step_revision_ids(enrollment, step, include_submissions=True),
        ).select_related("step").order_by("-created_at", "-attempt_number")
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(SubmissionSerializer(page, many=True, context={"request": request}).data)

    def post(self, request, enrollment_id, step_id):
        enrollment, step = self.get_enrollment_step(request, enrollment_id, step_id)
        input_class = INPUTS.get(step.type_key)
        if input_class is None:
            raise serializers.ValidationError({"step": ["Неподдерживаемый тип задания"]})
        form = input_class(data=request.data)
        form.is_valid(raise_exception=True)
        key = request.headers.get("Idempotency-Key", "")
        if len(key) > 128 or any(ord(char) < 32 for char in key):
            raise serializers.ValidationError({"Idempotency-Key": ["Некорректный ключ"]})
        data = dict(form.validated_data)
        upload = data.pop("file", None)
        submission, created = create_submission(
            enrollment=enrollment, step=step, user=request.user, data=data, upload=upload, idempotency_key=key
        )
        return data_response(request, SubmissionSerializer(submission, context={"request": request}).data,
                             status=201 if created else 200)


class PythonSampleView(StudentGradingView):
    def get(self, request, enrollment_id, step_id):
        enrollment, step = self.get_enrollment_step(request, enrollment_id, step_id)
        return data_response(request, create_python_sample(enrollment=enrollment, step=step))


class SubmissionDetailView(StudentGradingView):
    def get(self, request, submission_id):
        submission = get_object_or_404(Submission.objects.select_related("step"), pk=submission_id, student=request.user)
        return data_response(request, SubmissionSerializer(submission, context={"request": request}).data)


class SubmissionArtifactView(StudentGradingView):
    def get(self, request, submission_id):
        submission = get_object_or_404(Submission, pk=submission_id, student=request.user)
        if not submission.artifact_file:
            from rest_framework.exceptions import NotFound
            raise NotFound()
        return FileResponse(submission.artifact_file.open("rb"), as_attachment=True)


class SubmissionArtifactPreviewView(StudentGradingView):
    def get(self, request, submission_id):
        submission = get_object_or_404(Submission, pk=submission_id, student=request.user)
        suffix = Path(submission.artifact_file.name).suffix.lower() if submission.artifact_file else ""
        content_type = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(suffix)
        if not content_type:
            from rest_framework.exceptions import NotFound
            raise NotFound()
        response = FileResponse(submission.artifact_file.open("rb"), content_type=content_type)
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response


class StudentQuestionsView(StudentGradingView):
    def get(self, request, enrollment_id, step_id):
        enrollment, step = self.get_enrollment_step(request, enrollment_id, step_id)
        queryset = StepQuestion.objects.filter(
            enrollment=enrollment,
            step_id__in=related_step_revision_ids(enrollment, step, include_submissions=False),
        ).select_related(
            "student", "step", "enrollment__revision"
        )
        paginator = ContractPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(QuestionSerializer(page, many=True).data)

    def post(self, request, enrollment_id, step_id):
        enrollment, step = self.get_enrollment_step(request, enrollment_id, step_id)
        if enrollment.status != Enrollment.Status.ACTIVE:
            from .services import Conflict
            raise Conflict("Назначение не активно")
        form = QuestionInput(data=request.data)
        form.is_valid(raise_exception=True)
        question = StepQuestion.objects.create(enrollment=enrollment, step=step, student=request.user,
                                               question=form.validated_data["question"])
        StepQuestionMessage.objects.create(question=question, sender=request.user, body=question.question)
        return data_response(request, QuestionSerializer(question).data, status=201)


class StudentQuestionMessageView(StudentGradingView):
    def post(self, request, question_id):
        question = get_object_or_404(
            StepQuestion.objects.select_related("enrollment"), pk=question_id, student=request.user
        )
        if question.enrollment.status != Enrollment.Status.ACTIVE:
            from .services import Conflict
            raise Conflict("Назначение не активно")
        form = QuestionMessageInput(data=request.data)
        form.is_valid(raise_exception=True)
        StepQuestionMessage.objects.create(question=question, sender=request.user, body=form.validated_data["body"])
        return data_response(request, QuestionSerializer(question).data, status=201)
