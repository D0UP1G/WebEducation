from django.contrib import admin

from .models import Course, CourseRevision, DraftStep, StepRevision


admin.site.register(Course)
admin.site.register(DraftStep)
admin.site.register(CourseRevision)
admin.site.register(StepRevision)

