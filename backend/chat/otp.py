from __future__ import annotations

import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from .models import OtpChallenge
from .sms import SmsDeliveryError, send_sms

OTP_CODE_LENGTH = 6
OTP_MAX_ATTEMPTS = 5
OTP_TTL_SECONDS = 300

__all__ = [
    "OTP_MAX_ATTEMPTS",
    "OTP_TTL_SECONDS",
    "SmsDeliveryError",
    "consume_challenge",
    "issue_challenge",
    "verify_challenge",
]


def _generate_code() -> str:
    maximum = 10**OTP_CODE_LENGTH

    return f"{secrets.randbelow(maximum):0{OTP_CODE_LENGTH}d}"


def _message_for(code: str) -> str:
    minutes = max(1, OTP_TTL_SECONDS // 60)

    return (
        f"N’Teri : votre code de connexion est {code}. "
        f"Il expire dans {minutes} minutes. Ne le partagez jamais."
    )


def issue_challenge(phone: str) -> tuple[OtpChallenge, str]:
    """Invalide les anciens codes puis envoie un nouveau code à ``phone``."""

    now = timezone.now()
    code = _generate_code()
    with transaction.atomic():
        OtpChallenge.objects.filter(
            phone=phone,
            consumed_at__isnull=True,
        ).update(consumed_at=now)
        challenge = OtpChallenge.objects.create(
            phone=phone,
            code_hash=make_password(code),
            expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
        )

    try:
        send_sms(phone, _message_for(code))
    except SmsDeliveryError:
        challenge.delete()
        raise

    return challenge, code


def verify_challenge(challenge: OtpChallenge, code: str) -> bool:
    """Vérifie un code et incrémente son compteur d'essais si nécessaire."""

    with transaction.atomic():
        challenge = OtpChallenge.objects.select_for_update().get(pk=challenge.pk)
        now = timezone.now()
        if challenge.consumed_at is not None or challenge.expires_at <= now:
            return False
        if challenge.attempts >= OTP_MAX_ATTEMPTS:
            challenge.consumed_at = now
            challenge.save(update_fields=["consumed_at"])
            return False

        if check_password(code, challenge.code_hash):
            return True

        challenge.attempts += 1
        if challenge.attempts >= OTP_MAX_ATTEMPTS:
            challenge.consumed_at = now
        challenge.save(update_fields=["attempts", "consumed_at"])

        return False


def consume_challenge(challenge: OtpChallenge) -> bool:
    """Consomme le code une seule fois, même en cas de requêtes simultanées."""

    return bool(
        OtpChallenge.objects.filter(
            pk=challenge.pk,
            consumed_at__isnull=True,
        ).update(consumed_at=timezone.now())
    )


def dev_code_enabled() -> bool:
    return bool(getattr(settings, "DEBUG", False) and getattr(settings, "EXPOSE_OTP", False))
