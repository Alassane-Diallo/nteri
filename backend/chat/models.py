from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower
from django.utils import timezone


class User(AbstractUser):
    """Compte N'Teri.

    ``first_name`` et ``last_name`` composent le nom affiché. Le téléphone
    reste facultatif pour les comptes créés avant l'ouverture de l'API.
    """

    phone = models.CharField(max_length=24, unique=True, null=True, blank=True)
    avatar = models.URLField(blank=True, default="")
    last_seen = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=~Q(email=""),
                name="unique_user_email_ci",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def display_name(self) -> str:
        return self.get_full_name().strip() or self.username

    def mark_seen(self) -> None:
        User.objects.filter(pk=self.pk).update(last_seen=timezone.now())

    def __str__(self) -> str:
        return self.username


class Contact(models.Model):
    """Contact privé enregistré par un utilisateur.

    Chaque carnet est personnel : deux personnes peuvent se contacter sans
    partager ni exposer le reste de leur carnet d'adresses.
    """

    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="contact_links",
    )
    contact = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="contacted_by_links",
    )
    alias = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "contact"],
                name="unique_owner_contact",
            ),
            models.CheckConstraint(
                condition=~Q(owner=F("contact")),
                name="contact_cannot_be_self",
            ),
        ]
        indexes = [
            models.Index(
                fields=["owner", "created_at"],
                name="contact_owner_idx",
            ),
        ]

    @property
    def display_name(self) -> str:
        return self.alias.strip() or self.contact.display_name

    def __str__(self) -> str:
        return f"{self.owner.username} → {self.contact.username}"


class PushSubscription(models.Model):
    """Abonnement Web Push d'un navigateur pour un utilisateur."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["user"], name="push_user_idx"),
        ]

    def __str__(self) -> str:
        return f"Push {self.user.username} ({self.endpoint[:48]}…)"


class OtpChallenge(models.Model):
    """Code OTP à usage unique, stocké uniquement sous forme hachée."""

    class Channel(models.TextChoices):
        SMS = "sms", "SMS"
        EMAIL = "email", "Email"

    phone = models.CharField(max_length=24, db_index=True)
    email = models.EmailField(blank=True, default="", db_index=True)
    channel = models.CharField(
        max_length=10,
        choices=Channel.choices,
        default=Channel.SMS,
    )
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["phone", "-created_at"],
                name="otp_phone_created_idx",
            ),
        ]

    def __str__(self) -> str:
        destination = self.email or self.phone

        return f"OTP {destination} ({'consommé' if self.consumed_at else 'actif'})"


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
