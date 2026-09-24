from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.views import APIView

from apps.learning.models import Enrollment, StepQuestion, Submission
from apps.mentoring.serializers import QuestionInput, QuestionSerializer
from config.pagination import ContractPagination
from config.permissions import IsStudent
from config.responses import data_response
from .serializers import INPUTS, PythonChallengeInput, SubmissionSerializer
from .services import create_python_challenge, create_submission


class StudentGradingView(APIView):
    permission_classes = [IsStudent]

    def get_enrollment_step(self, request, enrollment_id, step_id):
        enrollment = get_object_or_404(Enrollment.objects.select_related("revision"), pk=enrollment_id, student=request.user)
        step = get_object_or_404(enrollment.revision.steps, pk=step_id)
        return enrollment, step


class SubmissionListView(StudentGradingView):
    def get(self, request, enrollment_id, step_id):
        enrollment, step = self.get_enrollment_step(request, enrollment_id, step_id)
        queryset = Submission.objects.filter(enrollment=enrollment, step=step).select_related("step").order_by("-attempt_number")
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


class PythonChallengeView(StudentGradingView):
    def post(self, request, enrollment_id, step_id):
        enrollment, step = self.get_enrollment_step(request, enrollment_id, step_id)
        form = PythonChallengeInput(data=request.data)
        form.is_valid(raise_exception=True)
        return data_response(request, create_python_challenge(
            enrollment=enrollment, step=step, user=request.user, code=form.validated_data["code"]
        ))


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


class StudentQuestionsView(StudentGradingView):
    def get(self, request, enrollment_id, step_id):
        enrollment, step = self.get_enrollment_step(request, enrollment_id, step_id)
        queryset = StepQuestion.objects.filter(enrollment=enrollment, step=step).select_related(
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
        return data_response(request, QuestionSerializer(question).data, status=201)
