from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers

from .models import User


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        user = authenticate(request=self.context.get("request"), **attrs)
        if user is None:
            raise serializers.ValidationError({"username": ["Неверное имя пользователя или пароль"]})
        if not user.is_active:
            raise serializers.ValidationError({"username": ["Неверное имя пользователя или пароль"]})
        attrs["user"] = user
        return attrs


class CurrentUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "display_name", "role")


class SetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=user_id, is_active=True, is_deleted=False,
                                    role__in=(User.Role.STUDENT, User.Role.CURATOR))
        except (TypeError, ValueError, OverflowError, DjangoValidationError, User.DoesNotExist):
            raise serializers.ValidationError({"token": ["Ссылка недействительна или устарела"]})
        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError({"token": ["Ссылка недействительна или устарела"]})
        try:
            password_validation.validate_password(attrs["password"], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        attrs["user"] = user
        return attrs
