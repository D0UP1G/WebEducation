from django.urls import path

from .views import PythonChallengeView, StudentQuestionsView, SubmissionArtifactView, SubmissionDetailView, SubmissionListView


urlpatterns = [
    path("enrollments/<uuid:enrollment_id>/steps/<uuid:step_id>/submissions", SubmissionListView.as_view()),
    path("enrollments/<uuid:enrollment_id>/steps/<uuid:step_id>/python-challenge", PythonChallengeView.as_view()),
    path("enrollments/<uuid:enrollment_id>/steps/<uuid:step_id>/questions", StudentQuestionsView.as_view()),
    path("submissions/<uuid:submission_id>", SubmissionDetailView.as_view()),
    path("submissions/<uuid:submission_id>/artifact", SubmissionArtifactView.as_view()),
]
