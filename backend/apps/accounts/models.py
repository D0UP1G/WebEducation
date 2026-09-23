import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "student", "Ученик"
        CURATOR = "curator", "Куратор"
        ADMIN = "admin", "Администратор"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    display_name = models.CharField(max_length=150)
    role = models.CharField(max_length=16, choices=Role.choices)

    def __str__(self):
        return self.display_name or self.username

