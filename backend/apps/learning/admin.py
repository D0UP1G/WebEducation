from django.contrib import admin

from .models import Enrollment, Review, StepQuestion, Submission


admin.site.register(Enrollment)
admin.site.register(Submission)
admin.site.register(Review)
admin.site.register(StepQuestion)

