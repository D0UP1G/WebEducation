from django.urls import path

from .views import (CuratorAnswerView, CuratorArtifactPreviewView, CuratorArtifactView, CuratorDecisionView, CuratorQuestionsView,
                    CuratorReviewListView, CuratorStudentProgressView, CuratorStudentsView, CuratorSubmissionView)


urlpatterns = [
    path("students", CuratorStudentsView.as_view()),
    path("students/<uuid:student_id>/enrollments/<uuid:enrollment_id>/progress", CuratorStudentProgressView.as_view()),
    path("reviews", CuratorReviewListView.as_view()),
    path("submissions/<uuid:submission_id>", CuratorSubmissionView.as_view()),
    path("submissions/<uuid:submission_id>/artifact", CuratorArtifactView.as_view()),
    path("submissions/<uuid:submission_id>/artifact-preview", CuratorArtifactPreviewView.as_view()),
    path("submissions/<uuid:submission_id>/review", CuratorDecisionView.as_view()),
    path("questions", CuratorQuestionsView.as_view()),
    path("questions/<uuid:question_id>/answer", CuratorAnswerView.as_view()),
]
