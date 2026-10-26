from __future__ import annotations

import logging
from typing import Final

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT: Final = 10


class SmsDeliveryError(RuntimeError):
    """Erreur d'envoi SMS sans exposer les détails du fournisseur."""


def _required_setting(name: str) -> str:
    value = getattr(settings, name, "").strip()
    if not value:
        raise SmsDeliveryError("La passerelle SMS n’est pas configurée.")

    return value


def _send_twilio(phone: str, message: str) -> None:
    account_sid = _required_setting("TWILIO_ACCOUNT_SID")
    auth_token = _required_setting("TWILIO_AUTH_TOKEN")
    from_number = _required_setting("TWILIO_FROM_NUMBER")

    try:
        response = requests.post(
            (
                "https://api.twilio.com/2010-04-01/Accounts/"
                f"{account_sid}/Messages.json"
            ),
            auth=(account_sid, auth_token),
            data={
                "To": phone,
                "From": from_number,
                "Body": message,
            },
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as error:
        raise SmsDeliveryError("La passerelle SMS est injoignable.") from error

    if not response.ok:
        logger.error("Twilio a refusé un envoi SMS (%s).", response.status_code)
        raise SmsDeliveryError("La passerelle SMS a refusé l’envoi.")


def _send_http(phone: str, message: str) -> None:
    url = _required_setting("SMS_WEBHOOK_URL")
    token = getattr(settings, "SMS_WEBHOOK_TOKEN", "").strip()
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        response = requests.post(
            url,
            json={"to": phone, "message": message},
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as error:
        raise SmsDeliveryError("La passerelle SMS est injoignable.") from error

    if not response.ok:
        logger.error("La passerelle SMS a refusé un envoi (%s).", response.status_code)
        raise SmsDeliveryError("La passerelle SMS a refusé l’envoi.")


def send_sms(phone: str, message: str) -> None:
    """Envoie un SMS via la passerelle configurée.

    Le mode ``console`` est réservé au développement : hors DEBUG, aucun code
    OTP ne doit apparaître dans les journaux.
    """

    backend = getattr(settings, "SMS_BACKEND", "console").strip().lower()

    if backend == "console":
        if not settings.DEBUG:
            raise SmsDeliveryError("Aucune passerelle SMS de production configurée.")
        logger.info("SMS de démonstration pour %s : %s", phone, message)
        return

    if backend == "twilio":
        _send_twilio(phone, message)
        return

    if backend == "http":
        _send_http(phone, message)
        return

    raise SmsDeliveryError("Passerelle SMS inconnue.")
