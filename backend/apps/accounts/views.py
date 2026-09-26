from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from config.responses import data_response
from .serializers import CurrentUserSerializer, LoginSerializer, SetPasswordSerializer
from .login_throttle import check_login_limit, clear_login_account_limit, login_keys, record_login_failure


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return data_response(request, {"csrf_token": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        username = request.data.get("username", "")
        keys = login_keys(request, username if isinstance(username, str) else "")
        check_login_limit(keys)
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            if "username" in serializer.errors and "password" in request.data:
                record_login_failure(keys)
            raise ValidationError(serializer.errors)
        clear_login_account_limit(keys[1])
        login(request, serializer.validated_data["user"])
        return data_response(request, CurrentUserSerializer(request.user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return data_response(request, {"logged_out": True})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return data_response(request, CurrentUserSerializer(request.user).data)


class SetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        form = SetPasswordSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        user = form.validated_data["user"]
        user.set_password(form.validated_data["password"])
        user.save(update_fields=("password",))
        return data_response(request, {"password_set": True})
