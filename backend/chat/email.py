from __future__ import annotations

import logging
from typing import Final

import requests
from django.conf import settings

from .delivery import OtpDeliveryError

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT: Final = 10
DEFAULT_RESEND_API_URL: Final = "https://api.resend.com/emails"


class EmailDeliveryError(OtpDeliveryError):
    """Erreur d'envoi d'email sans exposer les détails du fournisseur."""


def _required_setting(name: str) -> str:
    value = getattr(settings, name, "").strip()
    if not value:
        raise EmailDeliveryError("Le service email n’est pas configuré.")

    return value


def _from_header() -> str:
    address = _required_setting("RESEND_FROM_EMAIL")
    name = getattr(settings, "RESEND_FROM_NAME", "").strip()

    return f"{name} <{address}>" if name else address


def _send_resend(
    *,
    to: str,
    subject: str,
    text: str,
    html: str,
) -> None:
    api_key = _required_setting("RESEND_API_KEY")
    api_url = (
        getattr(settings, "RESEND_API_URL", "").strip() or DEFAULT_RESEND_API_URL
    )

    try:
        response = requests.post(
            api_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": _from_header(),
                "to": [to],
                "subject": subject,
                "text": text,
                "html": html,
            },
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as error:
        raise EmailDeliveryError("Le service email est injoignable.") from error

    if response.status_code >= 400:
        logger.warning(
            "Resend a refusé l’envoi d’un code OTP (HTTP %s).",
            response.status_code,
        )
        raise EmailDeliveryError("Le service email a refusé l’envoi.")


def send_otp_email(
    to: str,
    code: str,
    *,
    ttl_seconds: int = 300,
) -> None:
    """Envoie un code OTP par email via Resend (ou la console en DEBUG)."""

    backend = getattr(settings, "OTP_EMAIL_BACKEND", "resend").strip().lower()
    minutes = max(1, ttl_seconds // 60)
    subject = "Votre code de connexion N’Teri"
    text = (
        f"N’Teri : votre code de connexion est {code}. "
        f"Il expire dans {minutes} minutes. Ne le partagez jamais.\n\n"
        "Si vous n’êtes pas à l’origine de cette demande, ignorez cet email."
    )
    html = (
        "<div style=\"font-family:system-ui,-apple-system,'Segoe UI',sans-serif;"
        "max-width:520px;margin:0 auto;padding:32px 24px;color:#1f2937\">"
        "<p style=\"font-size:13px;font-weight:700;letter-spacing:.12em;"
        "text-transform:uppercase;color:#166534;margin:0 0 18px\">N’Teri</p>"
        "<h1 style=\"font-size:24px;line-height:1.2;margin:0 0 12px\">"
        "Votre code de connexion</h1>"
        "<p style=\"font-size:15px;line-height:1.6;margin:0 0 20px\">"
        "Saisissez ce code pour vous connecter. Il est valable "
        f"{minutes} minutes et ne doit jamais être partagé.</p>"
        "<p style=\"font-size:34px;font-weight:800;letter-spacing:.22em;"
        "margin:0 0 24px;color:#111827\">"
        f"{code}</p>"
        "<p style=\"font-size:13px;line-height:1.6;color:#6b7280;margin:0\">"
        "Si vous n’êtes pas à l’origine de cette demande, ignorez cet email."
        "</p></div>"
    )

    if backend == "console":
        if not getattr(settings, "DEBUG", False):
            raise EmailDeliveryError(
                "L’envoi d’emails en console est interdit en production."
            )
        logger.info("Code OTP pour %s : %s", to, code)
        return

    if backend == "resend":
        _send_resend(to=to, subject=subject, text=text, html=html)
        return

    raise EmailDeliveryError("Service email inconnu.")
