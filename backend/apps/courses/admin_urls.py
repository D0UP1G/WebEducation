from django.urls import path

from .views import (
    CourseDetailView,
    CourseListCreateView,
    CoursePreviewView,
    CourseTypesView,
    DraftStepCreateView,
    DraftStepDetailView,
    EnrollmentDetailView,
    EnrollmentListCreateView,
    PublishCourseView,
    UserOptionsView,
)


urlpatterns = [
    path("courses", CourseListCreateView.as_view(), name="admin-courses"),
    path("courses/<uuid:course_id>", CourseDetailView.as_view(), name="admin-course-detail"),
    path("courses/<uuid:course_id>/preview", CoursePreviewView.as_view(), name="admin-course-preview"),
    path("courses/<uuid:course_id>/steps", DraftStepCreateView.as_view(), name="admin-course-steps"),
    path(
        "courses/<uuid:course_id>/steps/<uuid:step_id>",
        DraftStepDetailView.as_view(),
        name="admin-course-step-detail",
    ),
    path("courses/<uuid:course_id>/publish", PublishCourseView.as_view(), name="admin-course-publish"),
    path("course-types", CourseTypesView.as_view(), name="admin-course-types"),
    path("users", UserOptionsView.as_view(), name="admin-users"),
    path("enrollments", EnrollmentListCreateView.as_view(), name="admin-enrollments"),
    path("enrollments/<uuid:enrollment_id>", EnrollmentDetailView.as_view(), name="admin-enrollment-detail"),
]
