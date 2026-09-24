import hashlib
import hmac
import ipaddress
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled

from .models import LoginAttempt


WINDOW = timedelta(minutes=15)
MAX_FAILURES = 5


def _key(kind, value):
    return hmac.new(settings.SECRET_KEY.encode(), f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()


def _client_ip(request):
    value = request.META.get("REMOTE_ADDR", "")
    if settings.TRUST_PROXY_IP_HEADER:
        value = request.META.get("HTTP_X_REAL_IP", value)
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return "unknown"


def login_keys(request, username):
    return (_key("ip", _client_ip(request)), _key("account", username.strip().casefold()))


def check_login_limit(keys):
    now = timezone.now()
    for attempt in LoginAttempt.objects.filter(key__in=keys):
        remaining = attempt.window_started_at + WINDOW - now
        if attempt.failures >= MAX_FAILURES and remaining.total_seconds() > 0:
            raise Throttled(wait=max(1, int(remaining.total_seconds())), detail="Слишком много попыток входа")


def record_login_failure(keys):
    now = timezone.now()
    for key in keys:
        with transaction.atomic():
            LoginAttempt.objects.get_or_create(key=key, defaults={"window_started_at": now})
            attempt = LoginAttempt.objects.select_for_update().get(key=key)
            if now - attempt.window_started_at >= WINDOW:
                attempt.window_started_at = now
                attempt.failures = 0
            attempt.failures += 1
            attempt.save(update_fields=["failures", "window_started_at"])


def clear_login_account_limit(key):
    LoginAttempt.objects.filter(key=key).delete()
