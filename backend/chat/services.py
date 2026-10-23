from __future__ import annotations

import logging

from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Conversation, ConversationParticipant, Message, User
from .serializers import ConversationSerializer, MessageSerializer

logger = logging.getLogger(__name__)


def direct_key_for(first_user_id: int, second_user_id: int) -> str:
    low, high = sorted((first_user_id, second_user_id))

    return f"{low}:{high}"


def conversation_for_user(
    user: User,
    conversation_id: int,
) -> Conversation | None:
    return (
        Conversation.objects.filter(pk=conversation_id, participants=user)
        .prefetch_related("participants")
        .first()
    )


def get_or_create_direct_conversation(
    user: User,
    other: User,
) -> tuple[Conversation, bool]:
    key = direct_key_for(user.pk, other.pk)
    existing = Conversation.objects.filter(direct_key=key).first()
    if existing:
        return existing, False

    try:
        with transaction.atomic():
            conversation = Conversation.objects.create(
                type=Conversation.ConversationType.PRIVATE,
                direct_key=key,
            )
            now = timezone.now()
            ConversationParticipant.objects.bulk_create(
                [
                    ConversationParticipant(
                        conversation=conversation,
                        user=user,
                        role=ConversationParticipant.Role.MEMBER,
                        last_read_at=now,
                    ),
                    ConversationParticipant(
                        conversation=conversation,
                        user=other,
                        role=ConversationParticipant.Role.MEMBER,
                        last_read_at=now,
                    ),
                ]
            )
    except IntegrityError:
        return Conversation.objects.get(direct_key=key), False

    return conversation, True


def create_group_conversation(
    owner: User,
    name: str,
    members: list[User],
) -> Conversation:
    with transaction.atomic():
        conversation = Conversation.objects.create(
            type=Conversation.ConversationType.GROUP,
            name=name,
        )
        now = timezone.now()
        ConversationParticipant.objects.bulk_create(
            [
                ConversationParticipant(
                    conversation=conversation,
                    user=owner,
                    role=ConversationParticipant.Role.ADMIN,
                    last_read_at=now,
                ),
                *[
                    ConversationParticipant(
                        conversation=conversation,
                        user=member,
                        role=ConversationParticipant.Role.MEMBER,
                        last_read_at=now,
                    )
                    for member in members
                ],
            ]
        )
        Message.objects.create(
            conversation=conversation,
            sender=owner,
            message_type=Message.MessageType.SYSTEM,
            content=f"Groupe créé par {owner.display_name}",
        )

    return conversation


def unread_count(conversation: Conversation, user: User) -> int:
    return unread_count_for_user(conversation, user.pk)


def unread_count_for_user(conversation: Conversation, user_id: int) -> int:
    link = ConversationParticipant.objects.filter(
        conversation=conversation,
        user_id=user_id,
    ).first()
    if link is None:
        return 0

    return (
        Message.objects.filter(
            conversation=conversation,
            created_at__gt=link.last_read_at,
        )
        .exclude(sender_id=user_id)
        .exclude(message_type=Message.MessageType.SYSTEM)
        .count()
    )


def mark_conversation_read(conversation: Conversation, user: User) -> None:
    ConversationParticipant.objects.filter(
        conversation=conversation,
        user=user,
    ).update(last_read_at=timezone.now())


def _participant_ids(conversation: Conversation) -> list[int]:
    return list(
        conversation.participant_links.values_list("user_id", flat=True)
    )


def _send_to_users(user_ids: list[int], payload: dict) -> None:
    try:
        channel_layer = get_channel_layer()
    except Exception:
        logger.exception("Couche de canaux indisponible pour la diffusion.")
        return

    if channel_layer is None:
        return

    for user_id in user_ids:
        try:
            async_to_sync(channel_layer.group_send)(
                f"user_{user_id}",
                {
                    "type": "chat.event",
                    "payload": payload,
                },
            )
        except Exception:
            logger.exception(
                "Diffusion temps réel impossible pour l’utilisateur %s.",
                user_id,
            )


def broadcast_conversation_created(
    conversation: Conversation,
    member_ids: list[int],
) -> None:
    _send_to_users(
        member_ids,
        {
            "type": "conversation.created",
            "conversationId": str(conversation.pk),
        },
    )


def close_user_sockets(user_id: int, *, session_key: str | None = None) -> None:
    _send_to_users(
        [user_id],
        {
            "type": "session.ended",
            "sessionKey": session_key,
        },
    )


def create_message(
    conversation: Conversation,
    sender: User,
    body: str,
) -> Message:
    with transaction.atomic():
        message = Message.objects.create(
            conversation=conversation,
            sender=sender,
            content=body,
            message_type=Message.MessageType.TEXT,
        )
        Conversation.objects.filter(pk=conversation.pk).update(
            updated_at=timezone.now()
        )
        ConversationParticipant.objects.filter(
            conversation=conversation,
            user=sender,
        ).update(last_read_at=timezone.now())

    serialized = MessageSerializer(message).data
    try:
        for user_id in _participant_ids(conversation):
            _send_to_users(
                [user_id],
                {
                    "type": "message.created",
                    "conversationId": str(conversation.pk),
                    "message": serialized,
                    "unread": unread_count_for_user(conversation, user_id),
                },
            )
    except Exception:
        # Le message est déjà enregistré : une panne du temps réel ne doit
        # pas provoquer une erreur côté client ni un nouvel envoi en double.
        logger.exception(
            "Diffusion impossible du message %s de la conversation %s.",
            message.pk,
            conversation.pk,
        )

    return message


def conversation_queryset_for_user(user: User):
    latest_messages = Message.objects.select_related("sender").order_by(
        "-created_at",
        "-id",
    )[:1]

    return (
        Conversation.objects.filter(participants=user)
        .prefetch_related(
            Prefetch("participants", queryset=User.objects.all()),
            Prefetch(
                "messages",
                queryset=latest_messages,
                to_attr="latest_messages",
            ),
        )
        .order_by("-updated_at", "-id")
    )


def serialize_conversation(
    conversation: Conversation,
    user: User,
    *,
    request=None,
) -> dict:
    conversation.unread_count = unread_count(conversation, user)

    return ConversationSerializer(
        conversation,
        context={"request": request} if request is not None else {},
    ).data
