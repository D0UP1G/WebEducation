from rest_framework.permissions import BasePermission


class RolePermission(BasePermission):
    required_role = None

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role == self.required_role)


class IsAdmin(RolePermission):
    required_role = "admin"


class IsStudent(RolePermission):
    required_role = "student"


class IsCurator(RolePermission):
    required_role = "curator"

