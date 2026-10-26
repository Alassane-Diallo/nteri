from __future__ import annotations

from datetime import UTC
from urllib.parse import urlparse

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from .models import Contact, Conversation, Message, User
from .validators import (
    normalize_message_body,
    normalize_phone,
    normalize_single_line,
)


def isoformat(value) -> str | None:
    if value is None:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())

    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def presence_label(last_seen) -> str:
    if not last_seen:
        return "Hors ligne"

    seconds = max(0, (timezone.now() - last_seen).total_seconds())
    if seconds < 120:
        return "En ligne"

    minutes = int(seconds // 60)
    if minutes < 60:
        return f"Vu il y a {max(1, minutes)} min"

    hours = minutes // 60
    if hours < 24:
        return f"Vu il y a {hours} h"

    days = hours // 24
    if days == 1:
        return "Vu hier"
    if days < 7:
        return f"Vu il y a {days} j"

    return "Vu récemment"


class UserSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    name = serializers.CharField(source="display_name", read_only=True)
    presence = serializers.SerializerMethodField()
    lastSeen = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "name", "phone", "avatar", "presence", "lastSeen")

    def get_id(self, obj: User) -> str:
        return str(obj.pk)

    def get_presence(self, obj: User) -> str:
        return presence_label(obj.last_seen)

    def get_lastSeen(self, obj: User) -> str | None:
        return isoformat(obj.last_seen)


class ContactSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    username = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    presence = serializers.SerializerMethodField()
    lastSeen = serializers.SerializerMethodField()
    alias = serializers.CharField(read_only=True)

    class Meta:
        model = Contact
        fields = (
            "id",
            "username",
            "name",
            "alias",
            "phone",
            "avatar",
            "presence",
            "lastSeen",
        )

    def get_id(self, obj: Contact) -> str:
        return str(obj.contact_id)

    def get_username(self, obj: Contact) -> str:
        return obj.contact.username

    def get_name(self, obj: Contact) -> str:
        return obj.display_name

    def get_phone(self, obj: Contact) -> str | None:
        return obj.contact.phone

    def get_avatar(self, obj: Contact) -> str:
        return obj.contact.avatar

    def get_presence(self, obj: Contact) -> str:
        return presence_label(obj.contact.last_seen)

    def get_lastSeen(self, obj: Contact) -> str | None:
        return isoformat(obj.contact.last_seen)


class ContactCreateSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    name = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True,
        default="",
    )

    def validate_phone(self, value: str) -> str:
        return normalize_phone(value)

    def validate_name(self, value: str) -> str:
        if not value.strip():
            return ""

        return normalize_single_line(
            value,
            label="Le nom du contact",
            max_length=150,
        )


class MessageSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    chatId = serializers.SerializerMethodField()
    authorId = serializers.SerializerMethodField()
    body = serializers.CharField(source="content", read_only=True)
    sentAt = serializers.SerializerMethodField()
    kind = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "chatId", "authorId", "body", "sentAt", "kind")

    def get_id(self, obj: Message) -> str:
        return str(obj.pk)

    def get_chatId(self, obj: Message) -> str:
        return str(obj.conversation_id)

    def get_authorId(self, obj: Message) -> str:
        return str(obj.sender_id)

    def get_sentAt(self, obj: Message) -> str | None:
        return isoformat(obj.created_at)

    def get_kind(self, obj: Message) -> str:
        if obj.message_type == Message.MessageType.SYSTEM:
            return "system"

        return "text"


class ConversationSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    kind = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    memberIds = serializers.SerializerMethodField()
    memberCount = serializers.SerializerMethodField()
    createdAt = serializers.SerializerMethodField()
    updatedAt = serializers.SerializerMethodField()
    lastMessage = serializers.SerializerMethodField()
    unread = serializers.SerializerMethodField()
    isOnline = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            "id",
            "kind",
            "name",
            "title",
            "avatar",
            "members",
            "memberIds",
            "memberCount",
            "createdAt",
            "updatedAt",
            "lastMessage",
            "unread",
            "isOnline",
        )

    def _members(self, obj: Conversation) -> list[User]:
        return list(obj.participants.all())

    def _other_member(self, obj: Conversation) -> User | None:
        request = self.context.get("request")
        if request is None:
            return None

        for member in self._members(obj):
            if member.pk != request.user.pk:
                return member

        return None

    def get_id(self, obj: Conversation) -> str:
        return str(obj.pk)

    def get_kind(self, obj: Conversation) -> str:
        if obj.type == Conversation.ConversationType.GROUP:
            return "group"

        return "direct"

    def get_name(self, obj: Conversation) -> str:
        if obj.is_group:
            return obj.name

        other = self._other_member(obj)
        return other.display_name if other else "Conversation"

    def get_title(self, obj: Conversation) -> str:
        return self.get_name(obj)

    def get_members(self, obj: Conversation) -> list[dict]:
        return UserSerializer(
            self._members(obj),
            many=True,
            context=self.context,
        ).data

    def get_memberIds(self, obj: Conversation) -> list[str]:
        return [str(member.pk) for member in self._members(obj)]

    def get_memberCount(self, obj: Conversation) -> int:
        return len(self._members(obj))

    def get_createdAt(self, obj: Conversation) -> str | None:
        return isoformat(obj.created_at)

    def get_updatedAt(self, obj: Conversation) -> str | None:
        return isoformat(obj.updated_at)

    def get_lastMessage(self, obj: Conversation) -> dict | None:
        latest = getattr(obj, "latest_messages", None)
        if latest is None:
            latest = list(
                obj.messages.select_related("sender").order_by(
                    "-created_at",
                    "-id",
                )[:1]
            )
        if not latest:
            return None

        return MessageSerializer(latest[0], context=self.context).data

    def get_unread(self, obj: Conversation) -> int:
        return int(getattr(obj, "unread_count", 0))

    def get_isOnline(self, obj: Conversation) -> bool:
        if obj.is_group:
            return False

        other = self._other_member(obj)
        return bool(other and presence_label(other.last_seen) == "En ligne")


class PushSubscriptionSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=500)
    keys = serializers.DictField(child=serializers.CharField(max_length=200))

    def validate_endpoint(self, value: str) -> str:
        parsed = urlparse(value)
        hostname = (parsed.hostname or "").lower().rstrip(".")
        if (
            parsed.scheme != "https"
            or not hostname
            or parsed.username
            or parsed.password
        ):
            raise serializers.ValidationError(
                "L’abonnement Push doit utiliser une adresse HTTPS valide."
            )

        allowed_hosts = [
            host.lower().strip(".")
            for host in getattr(settings, "PUSH_ALLOWED_HOSTS", [])
        ]
        if not any(
            hostname == host or hostname.endswith(f".{host}")
            for host in allowed_hosts
        ):
            raise serializers.ValidationError(
                "Ce service de notifications Push n’est pas autorisé."
            )

        return value

    def validate_keys(self, value: dict) -> dict:
        p256dh = str(value.get("p256dh", "")).strip()
        auth = str(value.get("auth", "")).strip()
        if not p256dh or not auth:
            raise serializers.ValidationError(
                "Les clés de l’abonnement Push sont incomplètes."
            )

        return {"p256dh": p256dh, "auth": auth}


class PushUnsubscribeSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=500)


class OtpRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)

    def validate_phone(self, value: str) -> str:
        return normalize_phone(value)


class OtpVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    code = serializers.RegexField(
        regex=r"^\d{6}$",
        error_messages={
            "invalid": "Le code doit contenir exactement 6 chiffres.",
        },
    )
    name = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True,
        default="",
    )

    def validate_phone(self, value: str) -> str:
        return normalize_phone(value)

    def validate_name(self, value: str) -> str:
        if not value.strip():
            return ""

        return normalize_single_line(
            value,
            label="Le nom",
            max_length=150,
        )


class ConversationCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=("direct", "group"))
    name = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default="",
    )
    memberIds = serializers.ListField(
        child=serializers.CharField(max_length=20),
        allow_empty=False,
        max_length=50,
    )

    def validate_memberIds(self, value: list[str]) -> list[int]:
        request = self.context["request"]
        member_ids: list[int] = []

        for raw_id in value:
            try:
                member_id = int(raw_id)
            except (TypeError, ValueError) as error:
                raise serializers.ValidationError(
                    "Un identifiant de membre est invalide."
                ) from error

            if member_id == request.user.pk:
                continue
            if member_id not in member_ids:
                member_ids.append(member_id)

        if not member_ids:
            raise serializers.ValidationError(
                "Sélectionnez au moins un autre membre."
            )

        links = list(
            Contact.objects.filter(
                owner=request.user,
                contact_id__in=member_ids,
                contact__is_active=True,
            )
            .select_related("contact")
            .order_by("contact_id")
        )
        if len(links) != len(member_ids):
            raise serializers.ValidationError(
                "Un des membres ne fait pas partie de votre carnet de contacts."
            )

        self._members = [link.contact for link in links]

        return member_ids

    def validate(self, attrs: dict) -> dict:
        kind = attrs["kind"]
        member_ids = attrs["memberIds"]

        if kind == "direct":
            if len(member_ids) != 1:
                raise serializers.ValidationError(
                    "Une conversation privée réunit exactement deux personnes."
                )
            attrs["name"] = ""
        else:
            if len(member_ids) < 2:
                raise serializers.ValidationError(
                    "Un groupe doit contenir au moins trois personnes au total."
                )
            attrs["name"] = normalize_single_line(
                attrs.get("name", ""),
                label="Le nom du groupe",
                max_length=100,
            )

        attrs["members"] = self._members

        return attrs


class MessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000, trim_whitespace=False)

    def validate_body(self, value: str) -> str:
        return normalize_message_body(value)
