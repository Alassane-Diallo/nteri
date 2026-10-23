from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.db import IntegrityError
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

from .models import Message, User
from .serializers import (
    ConversationCreateSerializer,
    LoginSerializer,
    MessageCreateSerializer,
    MessageSerializer,
    RegisterSerializer,
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
    LOGIN_BLOCK,
    LOGIN_LIMIT,
    LOGIN_WINDOW,
    REGISTER_BLOCK,
    REGISTER_LIMIT,
    REGISTER_WINDOW,
    FrenchScopedRateThrottle,
    assert_not_blocked,
    clear_attempts,
    client_ip,
    record_attempt,
)


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
class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        ip = client_ip(request)
        assert_not_blocked("register-ip", ip)
        record_attempt(
            "register-ip",
            ip,
            limit=REGISTER_LIMIT,
            window_seconds=REGISTER_WINDOW,
            block_seconds=REGISTER_BLOCK,
        )

        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = serializer.save()
        except IntegrityError:
            return Response(
                {"detail": "Ce compte existe déjà."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login(request, user)
        touch_last_seen(user)

        return Response(
            {
                "user": UserSerializer(user).data,
                "csrfToken": get_token(request),
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        ip = client_ip(request)
        assert_not_blocked("login-ip", ip)

        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        assert_not_blocked("login-user", username)

        candidate = User.objects.filter(username__iexact=username).first()
        auth_username = candidate.username if candidate else username
        user = authenticate(request, username=auth_username, password=password)

        if user is None:
            record_attempt(
                "login-ip",
                ip,
                limit=LOGIN_LIMIT,
                window_seconds=LOGIN_WINDOW,
                block_seconds=LOGIN_BLOCK,
            )
            record_attempt(
                "login-user",
                username,
                limit=LOGIN_LIMIT,
                window_seconds=LOGIN_WINDOW,
                block_seconds=LOGIN_BLOCK,
            )
            return Response(
                {"detail": "Nom d’utilisateur ou mot de passe incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clear_attempts("login-ip", ip)
        clear_attempts("login-user", username)
        login(request, user)
        touch_last_seen(user)

        return Response(
            {
                "user": UserSerializer(user).data,
                "csrfToken": get_token(request),
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        if request.user.is_authenticated:
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
        queryset = User.objects.filter(is_active=True).exclude(pk=request.user.pk)
        query = request.query_params.get("q", "").strip()
        if query:
            queryset = queryset.filter(
                Q(username__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(phone__icontains=query)
            )

        users = queryset.order_by("first_name", "last_name", "username")[:200]

        return Response(UserSerializer(users, many=True).data)


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
