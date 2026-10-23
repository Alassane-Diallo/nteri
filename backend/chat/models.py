from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.utils import timezone


class User(AbstractUser):
    """Compte N'Teri.

    ``first_name`` et ``last_name`` composent le nom affiché. Le téléphone
    reste facultatif pour les comptes créés avant l'ouverture de l'API.
    """

    phone = models.CharField(max_length=24, unique=True, null=True, blank=True)
    avatar = models.URLField(blank=True, default="")
    last_seen = models.DateTimeField(blank=True, null=True)

    @property
    def display_name(self) -> str:
        return self.get_full_name().strip() or self.username

    def mark_seen(self) -> None:
        User.objects.filter(pk=self.pk).update(last_seen=timezone.now())

    def __str__(self) -> str:
        return self.username


class Conversation(models.Model):
    class ConversationType(models.TextChoices):
        PRIVATE = "private", "Conversation privée"
        GROUP = "group", "Groupe"

    type = models.CharField(
        max_length=10,
        choices=ConversationType.choices,
        default=ConversationType.PRIVATE,
    )
    name = models.CharField(max_length=100, blank=True, default="")
    avatar = models.URLField(blank=True, default="")

    # Clé stable "petit_id:grand_id" pour garantir une seule conversation
    # privée par paire d'utilisateurs. Nulle pour les groupes.
    direct_key = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        editable=False,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    participants = models.ManyToManyField(
        User,
        through="ConversationParticipant",
        related_name="conversations",
    )

    class Meta:
        indexes = [
            models.Index(fields=["-updated_at"], name="conversation_updated_idx"),
        ]

    def __str__(self) -> str:
        return self.name or f"Conversation {self.pk}"

    @property
    def is_group(self) -> bool:
        return self.type == self.ConversationType.GROUP

    def other_participant(self, user: User) -> User | None:
        return self.participants.exclude(pk=user.pk).first()


class ConversationParticipant(models.Model):
    class Role(models.TextChoices):
        MEMBER = "member", "Membre"
        ADMIN = "admin", "Administrateur"

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="participant_links",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="conversation_links",
    )
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "user"],
                name="unique_conversation_participant",
            )
        ]
        indexes = [
            models.Index(fields=["user", "conversation"], name="participant_user_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.user.username} → {self.conversation_id}"


class Message(models.Model):
    class MessageType(models.TextChoices):
        TEXT = "text", "Texte"
        SYSTEM = "system", "Système"

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="sent_messages",
    )
    content = models.TextField()
    message_type = models.CharField(
        max_length=10,
        choices=MessageType.choices,
        default=MessageType.TEXT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(content=""),
                name="message_content_not_empty",
            )
        ]
        indexes = [
            models.Index(
                fields=["conversation", "-created_at"],
                name="message_conversation_idx",
            )
        ]

    def __str__(self) -> str:
        return f"{self.sender.username}: {self.content[:40]}"


class AuthAttempt(models.Model):
    """Compteur persistant pour limiter les tentatives d'authentification.

    La clé est un HMAC : ni l'adresse IP ni le nom d'utilisateur ne sont
    stockés en clair.
    """

    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    window_started_at = models.DateTimeField(default=timezone.now)
    blocked_until = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["blocked_until"], name="auth_attempt_block_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.key[:12]}… ({self.failures})"
