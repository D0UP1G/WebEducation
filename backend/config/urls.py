from django.contrib import admin
from django.urls import include, path

from config.views import HealthView


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health", HealthView.as_view(), name="health"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/admin/", include("apps.courses.admin_urls")),
    path("api/v1/student/", include("apps.grading.student_urls")),
    path("api/v1/student/", include("apps.progress.student_urls")),
    path("api/v1/student/", include("apps.learning.student_urls")),
    path("api/v1/curator/", include("apps.mentoring.urls")),
]
