from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class WebEducationUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("WebEducation", {"fields": ("display_name", "role")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("WebEducation", {"fields": ("display_name", "role")}),)
    list_display = ("username", "display_name", "role", "is_active")
    list_filter = ("role", "is_active")

