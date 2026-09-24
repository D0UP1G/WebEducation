from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import LoginAttempt


class Command(BaseCommand):
    help = "Delete expired login throttle counters older than one day"

    def handle(self, *args, **options):
        deleted, _ = LoginAttempt.objects.filter(window_started_at__lt=timezone.now() - timedelta(days=1)).delete()
        self.stdout.write(f"Deleted {deleted} expired login counters")
