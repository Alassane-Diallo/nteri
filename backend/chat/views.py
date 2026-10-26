from __future__ import annotations

import re
import secrets

from django.contrib.auth import login, logout
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Contact, Message, OtpChallenge, PushSubscription, User
from .otp import (
    OTP_TTL_SECONDS,
    SmsDeliveryError,
    consume_challenge,
    dev_code_enabled,
    issue_challenge,
    verify_challenge,
)
from .push import push_configured
from .serializers import (
    ContactCreateSerializer,
    ContactSerializer,
    ConversationCreateSerializer,
    MessageCreateSerializer,
    MessageSerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    PushSubscriptionSerializer,
    PushUnsubscribeSerializer,
    UserSerializer,
)
from .services import (
    broadcast_conversation_created,
    close_user_sockets,
    conversation_for_user,
    conversation_queryset_for_user,
    create_group_conversation,
    create_message,
    get_or_create_direct_conversation,
    mark_conversation_read,
    serialize_conversation,
)
from .throttling import (
    FrenchScopedRateThrottle,
    assert_not_blocked,
    clear_attempts,
    client_ip,
    record_attempt,
)

OTP_REQUEST_LIMIT = 3
OTP_REQUEST_WINDOW = 60 * 10
OTP_REQUEST_BLOCK = 60 * 15
OTP_REQUEST_IP_LIMIT = 10
OTP_VERIFY_IP_LIMIT = 20


def csrf_failure(request, reason: str = "") -> JsonResponse:
    return JsonResponse(
        {"detail": "Jeton de sécurité invalide ou expiré. Rechargez la page."},
        status=403,
    )


def touch_last_seen(user: User) -> None:
    now = timezone.now()
    if user.last_seen and (now - user.last_seen).total_seconds() < 30:
        return

    user.mark_seen()
    user.last_seen = now


def username_for_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    base = f"nteri_{digits}"[:140]
    candidate = base
    if User.objects.filter(username=candidate).exists():
        candidate = f"{base}_{secrets.token_hex(3)}"

    return candidate


def split_name(name: str) -> tuple[str, str]:
    parts = name.split(" ", 1)

    return parts[0], parts[1] if len(parts) > 1 else ""


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfTokenView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class OtpRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        ip = client_ip(request)

        assert_not_blocked("otp-request-ip", ip)
        assert_not_blocked("otp-request-phone", phone)
        record_attempt(
            "otp-request-ip",
            ip,
            limit=OTP_REQUEST_IP_LIMIT,
            window_seconds=OTP_REQUEST_WINDOW,
            block_seconds=OTP_REQUEST_BLOCK,
            enforce=False,
        )
        record_attempt(
            "otp-request-phone",
            phone,
            limit=OTP_REQUEST_LIMIT,
            window_seconds=OTP_REQUEST_WINDOW,
            block_seconds=OTP_REQUEST_BLOCK,
            enforce=False,
        )

        try:
            _, code = issue_challenge(phone)
        except SmsDeliveryError:
            return Response(
                {
                    "detail": (
                        "L’envoi du code a échoué. "
                        "Réessayez dans quelques instants."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        payload = {
            "detail": (
                "Si ce numéro peut recevoir des SMS, "
                "un code de connexion vient d’être envoyé."
            ),
            "expiresIn": OTP_TTL_SECONDS,
        }
        if dev_code_enabled():
            payload["devCode"] = code

        return Response(payload)


@method_decorator(csrf_protect, name="dispatch")
class OtpVerifyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone = serializer.validated_data["phone"]
        code = serializer.validated_data["code"]
        name = serializer.validated_data["name"]
        ip = client_ip(request)

        assert_not_blocked("otp-verify-ip", ip)
        challenge = (
            OtpChallenge.objects.filter(
                phone=phone,
                consumed_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .order_by("-created_at")
            .first()
        )

        if challenge is None or not verify_challenge(challenge, code):
            record_attempt(
                "otp-verify-ip",
                ip,
                limit=OTP_VERIFY_IP_LIMIT,
                window_seconds=OTP_REQUEST_WINDOW,
                block_seconds=OTP_REQUEST_BLOCK,
                enforce=False,
            )
            return Response(
                {"detail": "Code expiré ou invalide. Demandez un nouveau code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(phone=phone, is_active=True).first()
        created = False

        if user is None:
            if not name:
                return Response(
                    {
                        "detail": (
                            "Indiquez votre nom complet pour créer votre compte."
                        ),
                        "requiresName": True,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(name.strip()) < 2:
                return Response(
                    {"name": ["Indiquez votre nom complet."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            first_name, last_name = split_name(name)
            try:
                with transaction.atomic():
                    user = User.objects.create_user(
                        username=username_for_phone(phone),
                        phone=phone,
                        first_name=first_name,
                        last_name=last_name,
                    )
                created = True
            except IntegrityError:
                user = User.objects.filter(phone=phone, is_active=True).first()
                if user is None:
                    return Response(
                        {
                            "detail": (
                                "Ce numéro est déjà associé à un autre compte."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        if not consume_challenge(challenge):
            return Response(
                {"detail": "Code expiré ou invalide. Demandez un nouveau code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login(
            request,
            user,
            backend="django.contrib.auth.backends.ModelBackend",
        )
        touch_last_seen(user)

        clear_attempts("otp-request-phone", phone)
        clear_attempts("otp-request-ip", ip)
        clear_attempts("otp-verify-ip", ip)

        return Response(
            {
                "user": UserSerializer(user).data,
                "csrfToken": get_token(request),
                "isNewAccount": created,
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        if request.user.is_authenticated:
            PushSubscription.objects.filter(user=request.user).delete()
            close_user_sockets(
                request.user.pk,
                session_key=request.session.session_key,
            )
        logout(request)

        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FrenchScopedRateThrottle]
    throttle_scope = "me"

    def get(self, request):
        touch_last_seen(request.user)

        return Response(UserSerializer(request.user).data)


class ContactListView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FrenchScopedRateThrottle]
    throttle_scope = "contacts"

    def get(self, request):
        queryset = (
            Contact.objects.filter(owner=request.user, contact__is_active=True)
            .select_related("contact")
        )
        query = request.query_params.get("q", "").strip()
        if query:
            queryset = queryset.filter(
                Q(contact__username__icontains=query)
                | Q(contact__first_name__icontains=query)
                | Q(contact__last_name__icontains=query)
                | Q(contact__phone__icontains=query)
                | Q(alias__icontains=query)
            )

        contacts = queryset.order_by(
            "alias",
            "contact__first_name",
            "contact__last_name",
            "contact__username",
        )[:200]

        return Response(ContactSerializer(contacts, many=True).data)

    def post(self, request):
        serializer = ContactCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        name = serializer.validated_data["name"]

        target = User.objects.filter(phone=phone, is_active=True).first()
        if target is None:
            return Response(
                {"detail": "Aucun compte N’Teri n’utilise ce numéro."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target.pk == request.user.pk:
            return Response(
                {"detail": "Vous ne pouvez pas vous ajouter vous-même."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link, created = Contact.objects.get_or_create(
            owner=request.user,
            contact=target,
        )
        if name and link.alias != name:
            link.alias = name
            link.save(update_fields=["alias"])

        link = Contact.objects.select_related("contact").get(pk=link.pk)

        return Response(
            ContactSerializer(link).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ContactDetailView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FrenchScopedRateThrottle]
    throttle_scope = "contacts"

    def delete(self, request, contact_id: int):
        Contact.objects.filter(
            owner=request.user,
            contact_id=contact_id,
        ).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class PushConfigView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FrenchScopedRateThrottle]
    throttle_scope = "reads"

    def get(self, request):
        enabled = push_configured()

        return Response(
            {
                "enabled": enabled,
                "publicKey": (
                    getattr(settings, "VAPID_PUBLIC_KEY", "") if enabled else ""
                ),
            }
        )


class PushSubscribeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FrenchScopedRateThrottle]
    throttle_scope = "messages"

    def post(self, request):
        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        subscription, created = PushSubscription.objects.update_or_create(
            endpoint=data["endpoint"],
            defaults={
                "user": request.user,
                "p256dh": data["keys"]["p256dh"],
                "auth": data["keys"]["auth"],
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
            },
        )

        return Response(
            {"enabled": True, "id": subscription.pk},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class PushUnsubscribeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FrenchScopedRateThrottle]
    throttle_scope = "messages"

    def post(self, request):
        serializer = PushUnsubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushSubscription.objects.filter(
            user=request.user,
            endpoint=serializer.validated_data["endpoint"],
        ).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class ConversationListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "conversations"

    def get_throttles(self):
        self.throttle_scope = (
            "conversations" if self.request.method == "POST" else "reads"
        )

        return [FrenchScopedRateThrottle()]

    def get(self, request):
        conversations = conversation_queryset_for_user(request.user)[:200]

        return Response(
            [
                serialize_conversation(conversation, request.user, request=request)
                for conversation in conversations
            ]
        )

    def post(self, request):
        serializer = ConversationCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        kind = serializer.validated_data["kind"]
        members = serializer.validated_data["members"]
        created = True

        if kind == "direct":
            conversation, created = get_or_create_direct_conversation(
                request.user,
                members[0],
            )
        else:
            conversation = create_group_conversation(
                request.user,
                serializer.validated_data["name"],
                members,
            )

        conversation = conversation_queryset_for_user(request.user).get(
            pk=conversation.pk
        )

        if created:
            broadcast_conversation_created(
                conversation,
                [
                    int(member_id)
                    for member_id in conversation.participants.values_list(
                        "id", flat=True
                    )
                ],
            )

        payload = serialize_conversation(
            conversation,
            request.user,
            request=request,
        )

        return Response(
            payload,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FrenchScopedRateThrottle]
    throttle_scope = "reads"

    def get(self, request, conversation_id: int):
        conversation = conversation_for_user(request.user, conversation_id)
        if conversation is None:
            return Response(
                {"detail": "Conversation introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            serialize_conversation(conversation, request.user, request=request)
        )


class ConversationMessagesView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "messages"

    def get_throttles(self):
        self.throttle_scope = (
            "messages" if self.request.method == "POST" else "reads"
        )

        return [FrenchScopedRateThrottle()]

    def get(self, request, conversation_id: int):
        conversation = conversation_for_user(request.user, conversation_id)
        if conversation is None:
            return Response(
                {"detail": "Conversation introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            limit = min(max(int(request.query_params.get("limit", 100)), 1), 100)
            before = request.query_params.get("before")
            before_id = int(before) if before else None
        except (TypeError, ValueError):
            return Response(
                {"detail": "Paramètres de pagination invalides."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = Message.objects.filter(conversation=conversation).select_related(
            "sender"
        )
        if before_id is not None:
            queryset = queryset.filter(id__lt=before_id)

        rows = list(queryset.order_by("-created_at", "-id")[: limit + 1])
        has_more = len(rows) > limit
        rows = rows[:limit]
        rows.reverse()

        return Response(
            {
                "messages": MessageSerializer(rows, many=True).data,
                "hasMore": has_more,
            }
        )

    def post(self, request, conversation_id: int):
        conversation = conversation_for_user(request.user, conversation_id)
        if conversation is None:
            return Response(
                {"detail": "Conversation introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = create_message(
            conversation,
            request.user,
            serializer.validated_data["body"],
        )

        return Response(
            MessageSerializer(message).data,
            status=status.HTTP_201_CREATED,
        )


class ConversationReadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FrenchScopedRateThrottle]
    throttle_scope = "reads"

    def post(self, request, conversation_id: int):
        conversation = conversation_for_user(request.user, conversation_id)
        if conversation is None:
            return Response(
                {"detail": "Conversation introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        mark_conversation_read(conversation, request.user)

        return Response({"unread": 0})
