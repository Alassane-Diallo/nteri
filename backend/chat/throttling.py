from __future__ import annotations

import hashlib
import hmac
import ipaddress
import math
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled
from rest_framework.throttling import ScopedRateThrottle

from .models import AuthAttempt

LOGIN_LIMIT = 10
LOGIN_WINDOW = 60 * 5
LOGIN_BLOCK = 60 * 15
REGISTER_LIMIT = 5
REGISTER_WINDOW = 60 * 60
REGISTER_BLOCK = 60 * 60


def client_ip(request) -> str:
    """Retourne l'IP du client sans faire confiance aux en-têtes par défaut."""

    if getattr(settings, "TRUST_PROXY_HEADERS", False):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        candidate = forwarded.split(",")[0].strip()
        try:
            ipaddress.ip_address(candidate)
            return candidate
        except ValueError:
            pass

    return request.META.get("REMOTE_ADDR", "inconnu")


def _key(scope: str, identifier: str) -> str:
    message = f"{scope}:{identifier}".encode()
    return hmac.new(
        settings.SECRET_KEY.encode(),
        message,
        hashlib.sha256,
    ).hexdigest()


def _retry_after(blocked_until) -> int:
    seconds = (blocked_until - timezone.now()).total_seconds()

    return max(1, math.ceil(seconds))


def assert_not_blocked(scope: str, identifier: str) -> None:
    attempt = AuthAttempt.objects.filter(key=_key(scope, identifier)).first()
    if not attempt or not attempt.blocked_until:
        return
    if attempt.blocked_until <= timezone.now():
        return

    wait = _retry_after(attempt.blocked_until)
    raise Throttled(
        wait=wait,
        detail=(
            "Trop de tentatives. Réessayez dans "
            f"{max(1, math.ceil(wait / 60))} minute(s)."
        ),
    )


def record_attempt(
    scope: str,
    identifier: str,
    *,
    limit: int,
    window_seconds: int,
    block_seconds: int,
) -> None:
    now = timezone.now()
    key = _key(scope, identifier)

    with transaction.atomic():
        attempt, _ = AuthAttempt.objects.select_for_update().get_or_create(
            key=key,
            defaults={"window_started_at": now},
        )

        if (now - attempt.window_started_at).total_seconds() > window_seconds:
            attempt.failures = 0
            attempt.window_started_at = now
            attempt.blocked_until = None

        attempt.failures += 1
        if attempt.failures >= limit:
            attempt.blocked_until = now + timedelta(seconds=block_seconds)
        attempt.save(
            update_fields=[
                "failures",
                "window_started_at",
                "blocked_until",
                "updated_at",
            ]
        )

    assert_not_blocked(scope, identifier)


def clear_attempts(scope: str, identifier: str) -> None:
    AuthAttempt.objects.filter(key=_key(scope, identifier)).delete()


class FrenchScopedRateThrottle(ScopedRateThrottle):
    """Limiteur DRF avec un message d'erreur en français."""

    def throttle_failure(self):
        wait = max(1, int(self.wait() or 1))
        if wait < 60:
            delay = f"{wait} seconde{'s' if wait > 1 else ''}"
        else:
            minutes = math.ceil(wait / 60)
            delay = f"{minutes} minute{'s' if minutes > 1 else ''}"

        raise Throttled(
            wait=wait,
            detail=f"Trop de requêtes. Réessayez dans {delay}.",
        )
