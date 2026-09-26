from django.urls import path

from .views import (
    StudentCourseListView,
    StudentCourseRatingView,
    StudentEnrollmentView,
    StudentProgressView,
    StudentStepView,
)


urlpatterns = [
    path("courses", StudentCourseListView.as_view(), name="student-courses"),
    path("enrollments/<uuid:enrollment_id>", StudentEnrollmentView.as_view(), name="student-enrollment"),
    path(
        "enrollments/<uuid:enrollment_id>/progress", StudentProgressView.as_view(), name="student-enrollment-progress"
    ),
    path(
        "enrollments/<uuid:enrollment_id>/rating", StudentCourseRatingView.as_view(), name="student-course-rating"
    ),
    path(
        "enrollments/<uuid:enrollment_id>/steps/<uuid:step_id>",
        StudentStepView.as_view(),
        name="student-step",
    ),
]
