from django.contrib import admin

from .models import Course, CourseRevision, DraftStep, Module, ModuleRevision, StepRevision


admin.site.register(Course)
admin.site.register(DraftStep)
admin.site.register(Module)
admin.site.register(CourseRevision)
admin.site.register(ModuleRevision)
admin.site.register(StepRevision)
