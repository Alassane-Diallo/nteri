from __future__ import annotations

import json
import logging

from django.conf import settings
from django.utils import timezone

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # pragma: no cover - dépendance déployée via requirements.txt
    WebPushException = Exception  # type: ignore[assignment,misc]
    webpush = None

from .models import Conversation, Message, PushSubscription, User

logger = logging.getLogger(__name__)

PUSH_BODY_LIMIT = 180
PUSH_TITLE_LIMIT = 90


def _shorten(value: str, limit: int) -> str:
    value = " ".join(value.split())
    if len(value) <= limit:
        return value

    return f"{value[: limit - 1].rstrip()}…"


def push_configured() -> bool:
    return bool(
        getattr(settings, "VAPID_PUBLIC_KEY", "").strip()
        and getattr(settings, "VAPID_PRIVATE_KEY", "").strip()
    )


def _payload_for(
    conversation: Conversation,
    sender: User,
    message: Message,
) -> str:
    is_group = conversation.is_group
    title = _shorten(
        (
            conversation.name.strip()
            if is_group and conversation.name.strip()
            else sender.display_name
        ),
        PUSH_TITLE_LIMIT,
    )
    if is_group:
        first_name = sender.display_name.split(" ")[0]
        body = _shorten(f"{first_name} : {message.content}", PUSH_BODY_LIMIT)
    else:
        body = _shorten(message.content, PUSH_BODY_LIMIT)

    return json.dumps(
        {
            "title": title,
            "body": body,
            "chatId": str(conversation.pk),
            "tag": f"nteri-chat-{conversation.pk}",
        },
        ensure_ascii=False,
    )


def send_push_for_message(
    conversation: Conversation,
    sender: User,
    message: Message,
) -> None:
    """Envoie une notification aux autres participants abonnés.

    Cette fonction est volontairement tolérante aux pannes : un message déjà
    enregistré ne doit jamais échouer parce qu’une notification n’est pas
    partie.
    """

    if webpush is None or not push_configured():
        return

    recipient_ids = list(
        conversation.participant_links.exclude(user_id=sender.pk).values_list(
            "user_id",
            flat=True,
        )
    )
    if not recipient_ids:
        return

    subscriptions = PushSubscription.objects.filter(
        user_id__in=recipient_ids,
        user__is_active=True,
    )
    if not subscriptions.exists():
        return

    data = _payload_for(conversation, sender, message)
    claims = {"sub": settings.VAPID_SUBJECT}

    for subscription in subscriptions.iterator():
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.p256dh,
                        "auth": subscription.auth,
                    },
                },
                data=data,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims=claims,
                timeout=10,
            )
        except WebPushException as error:
            status_code = getattr(error.response, "status_code", None)
            if status_code in {404, 410}:
                # L’abonnement n’existe plus côté navigateur.
                subscription.delete()
            else:
                logger.warning(
                    "Notification Web Push refusée pour l’abonnement %s (%s).",
                    subscription.pk,
                    status_code or "inconnu",
                )
        except Exception:
            logger.exception(
                "Notification Web Push impossible pour l’abonnement %s.",
                subscription.pk,
            )
        else:
            PushSubscription.objects.filter(pk=subscription.pk).update(
                last_used_at=timezone.now()
            )


__all__ = ["push_configured", "send_push_for_message"]
