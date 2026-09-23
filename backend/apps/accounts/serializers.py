from django.contrib.auth import authenticate
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
            raise serializers.ValidationError({"username": ["Учётная запись отключена"]})
        attrs["user"] = user
        return attrs


class CurrentUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "display_name", "role")

