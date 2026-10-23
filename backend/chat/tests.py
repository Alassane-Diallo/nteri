from __future__ import annotations

from datetime import timedelta
from io import StringIO

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.auth import AuthMiddlewareStack
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.management import call_command
from django.test import Client, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from .models import AuthAttempt, Conversation, Message, User
from .routing import websocket_urlpatterns
from .services import create_message, get_or_create_direct_conversation

TEST_PASSWORD = "UnMotDePasseSolide2026!"


def make_user(
    username: str,
    first_name: str,
    last_name: str,
    phone: str,
) -> User:
    return User.objects.create_user(
        username=username,
        password=TEST_PASSWORD,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
    )


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class AuthApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user("awa", "Awa", "Traoré", "+22376123456")

    def csrf_client(self) -> tuple[APIClient, str]:
        client = APIClient(enforce_csrf_checks=True)
        response = client.get("/api/auth/csrf/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("csrfToken", response.data)

        return client, response.data["csrfToken"]

    def test_csrf_is_required_for_login(self):
        client = APIClient(enforce_csrf_checks=True)
        denied = client.post(
            "/api/auth/login/",
            {"username": "awa", "password": TEST_PASSWORD},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        token = client.get("/api/auth/csrf/").data["csrfToken"]
        allowed = client.post(
            "/api/auth/login/",
            {"username": "awa", "password": TEST_PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(allowed.status_code, 200)

    def test_registration_creates_session_and_validates_password(self):
        client, token = self.csrf_client()

        weak = client.post(
            "/api/auth/register/",
            {
                "username": "fatoumata",
                "name": "Fatoumata Keïta",
                "phone": "+22375086321",
                "password": "court",
            },
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(weak.status_code, 400)
        self.assertIn("password", weak.data)

        created = client.post(
            "/api/auth/register/",
            {
                "username": "fatoumata",
                "name": "Fatoumata Keïta",
                "phone": "+22375086321",
                "password": "UnAutreMotDePasse2026!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(User.objects.filter(username="fatoumata").exists())

        me = client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "fatoumata")

    def test_login_is_case_insensitive_and_logout_closes_session(self):
        client, token = self.csrf_client()
        response = client.post(
            "/api/auth/login/",
            {"username": "AWA", "password": TEST_PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)

        self.assertEqual(client.get("/api/auth/me/").status_code, 200)
        self.assertEqual(
            client.post(
                "/api/auth/logout/",
                HTTP_X_CSRFTOKEN=response.data["csrfToken"],
            ).status_code,
            204,
        )
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_failed_logins_are_rate_limited(self):
        client, token = self.csrf_client()
        statuses = []

        for _ in range(10):
            response = client.post(
                "/api/auth/login/",
                {"username": "awa", "password": "mauvais-mot-de-passe"},
                format="json",
                HTTP_X_CSRFTOKEN=token,
            )
            statuses.append(response.status_code)

        self.assertEqual(statuses[:9], [400] * 9)
        self.assertEqual(statuses[9], 429)

        blocked = client.post(
            "/api/auth/login/",
            {"username": "awa", "password": TEST_PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(blocked.status_code, 429)

    def test_anonymous_me_returns_401(self):
        self.assertEqual(APIClient().get("/api/auth/me/").status_code, 401)

    def test_clean_auth_attempts_removes_only_old_rows(self):
        old = AuthAttempt.objects.create(key="old")
        recent = AuthAttempt.objects.create(key="recent")
        AuthAttempt.objects.filter(pk=old.pk).update(
            updated_at=timezone.now() - timedelta(days=30)
        )

        call_command("clean_auth_attempts", stdout=StringIO())

        self.assertFalse(AuthAttempt.objects.filter(pk=old.pk).exists())
        self.assertTrue(AuthAttempt.objects.filter(pk=recent.pk).exists())


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class ChatApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.awa = make_user("awa", "Awa", "Traoré", "+22376123456")
        self.moussa = make_user("moussa", "Moussa", "Diarra", "+22370451289")
        self.fatoumata = make_user(
            "fatoumata", "Fatoumata", "Keïta", "+22375086321"
        )
        self.conversation, _ = get_or_create_direct_conversation(
            self.awa,
            self.moussa,
        )
        self.client.force_authenticate(self.awa)

    def test_non_member_cannot_read_or_write(self):
        outsider = APIClient()
        outsider.force_authenticate(self.fatoumata)

        self.assertEqual(
            outsider.get(
                f"/api/conversations/{self.conversation.pk}/messages/"
            ).status_code,
            404,
        )
        self.assertEqual(
            outsider.post(
                f"/api/conversations/{self.conversation.pk}/messages/",
                {"body": "Intrusion"},
                format="json",
            ).status_code,
            404,
        )
        self.assertEqual(
            outsider.post(
                f"/api/conversations/{self.conversation.pk}/read/",
            ).status_code,
            404,
        )
        self.assertEqual(outsider.get("/api/conversations/").data, [])

    def test_message_is_saved_and_unread_count_is_server_side(self):
        sent = self.client.post(
            f"/api/conversations/{self.conversation.pk}/messages/",
            {"body": "Bonjour Moussa"},
            format="json",
        )
        self.assertEqual(sent.status_code, 201)
        self.assertEqual(sent.data["kind"], "text")
        self.assertEqual(sent.data["body"], "Bonjour Moussa")

        moussa_client = APIClient()
        moussa_client.force_authenticate(self.moussa)
        conversations = moussa_client.get("/api/conversations/").data
        self.assertEqual(conversations[0]["unread"], 1)

        self.assertEqual(
            moussa_client.post(
                f"/api/conversations/{self.conversation.pk}/read/"
            ).status_code,
            200,
        )
        conversations = moussa_client.get("/api/conversations/").data
        self.assertEqual(conversations[0]["unread"], 0)

        own = self.client.get("/api/conversations/").data
        self.assertEqual(own[0]["unread"], 0)

    def test_message_validation_rejects_empty_too_long_and_control_chars(self):
        url = f"/api/conversations/{self.conversation.pk}/messages/"

        for body in ("   ", "x" * 4001, "Bonjour\x00monde", "Bonjour\u202emonde"):
            response = self.client.post(url, {"body": body}, format="json")
            self.assertEqual(response.status_code, 400, body[:20])

        valid = self.client.post(
            url,
            {"body": "Bonjour\r\nsur deux lignes"},
            format="json",
        )
        self.assertEqual(valid.status_code, 201)
        self.assertEqual(valid.data["body"], "Bonjour\nsur deux lignes")

    def test_direct_conversations_are_unique(self):
        again, created = get_or_create_direct_conversation(self.moussa, self.awa)
        self.assertFalse(created)
        self.assertEqual(again.pk, self.conversation.pk)
        self.assertEqual(
            Conversation.objects.filter(type="private").count(),
            1,
        )

    def test_direct_conversation_can_be_created_from_api(self):
        response = self.client.post(
            "/api/conversations/",
            {"kind": "direct", "memberIds": [str(self.moussa.pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], str(self.conversation.pk))

        response = self.client.post(
            "/api/conversations/",
            {"kind": "direct", "memberIds": [str(self.fatoumata.pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["kind"], "direct")
        self.assertEqual(response.data["memberCount"], 2)
        created = Conversation.objects.get(pk=response.data["id"])
        self.assertEqual(created.participants.count(), 2)

        invalid = self.client.post(
            "/api/conversations/",
            {
                "kind": "direct",
                "memberIds": [str(self.moussa.pk), str(self.fatoumata.pk)],
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

    def test_group_requires_name_and_two_other_members(self):
        payload = {
            "kind": "group",
            "name": "A",
            "memberIds": [str(self.moussa.pk)],
        }
        self.assertEqual(
            self.client.post(
                "/api/conversations/",
                payload,
                format="json",
            ).status_code,
            400,
        )

        payload = {
            "kind": "group",
            "name": "Famille N’Teri",
            "memberIds": [str(self.moussa.pk), str(self.fatoumata.pk)],
        }
        response = self.client.post("/api/conversations/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["kind"], "group")
        self.assertEqual(response.data["memberCount"], 3)
        self.assertEqual(response.data["lastMessage"]["kind"], "system")

        group = Conversation.objects.get(pk=response.data["id"])
        self.assertTrue(
            Message.objects.filter(
                conversation=group,
                message_type=Message.MessageType.SYSTEM,
            ).exists()
        )

    def test_group_history_is_hidden_from_non_members(self):
        group = Conversation.objects.create(
            type=Conversation.ConversationType.GROUP,
            name="Privé",
        )
        group.participants.add(self.awa, self.moussa)

        outsider = APIClient()
        outsider.force_authenticate(self.fatoumata)

        self.assertEqual(
            outsider.get(f"/api/conversations/{group.pk}/").status_code,
            404,
        )
        self.assertEqual(
            outsider.get(f"/api/conversations/{group.pk}/messages/").status_code,
            404,
        )

    def test_contacts_exclude_current_user(self):
        response = self.client.get("/api/contacts/")
        self.assertEqual(response.status_code, 200)
        ids = {contact["id"] for contact in response.data}
        self.assertNotIn(str(self.awa.pk), ids)
        self.assertIn(str(self.moussa.pk), ids)

    def test_contacts_endpoint_is_rate_limited(self):
        responses = [self.client.get("/api/contacts/") for _ in range(121)]
        throttled = [response for response in responses if response.status_code == 429]
        self.assertTrue(throttled)
        self.assertIn("Trop de requêtes", str(throttled[0].data["detail"]))

    def test_message_pagination_returns_latest_page(self):
        for index in range(5):
            create_message(self.conversation, self.awa, f"Message {index}")

        response = self.client.get(
            f"/api/conversations/{self.conversation.pk}/messages/?limit=2"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["messages"]), 2)
        self.assertTrue(response.data["hasMore"])
        self.assertEqual(response.data["messages"][-1]["body"], "Message 4")

        oldest_returned = response.data["messages"][0]["id"]
        older = self.client.get(
            f"/api/conversations/{self.conversation.pk}/messages/"
            f"?limit=2&before={oldest_returned}"
        )
        self.assertEqual(older.status_code, 200)
        self.assertEqual(len(older.data["messages"]), 2)
        self.assertEqual(older.data["messages"][-1]["body"], "Message 2")

    def test_message_send_is_rate_limited(self):
        url = f"/api/conversations/{self.conversation.pk}/messages/"
        responses = [
            self.client.post(url, {"body": f"Message {index}"}, format="json")
            for index in range(41)
        ]
        throttled = [response for response in responses if response.status_code == 429]
        self.assertTrue(throttled)
        self.assertIn("Trop de requêtes", str(throttled[0].data["detail"]))


class InboxConsumerTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.awa = make_user("awa", "Awa", "Traoré", "+22376123456")
        self.moussa = make_user("moussa", "Moussa", "Diarra", "+22370451289")
        self.conversation, _ = get_or_create_direct_conversation(
            self.awa,
            self.moussa,
        )
        self.http_client = Client()
        self.http_client.force_login(self.awa)
        self.session_key = self.http_client.cookies[
            settings.SESSION_COOKIE_NAME
        ].value

    def _communicator(self, session_key: str | None = None):
        headers = []
        if session_key:
            headers.append(
                (
                    b"cookie",
                    f"{settings.SESSION_COOKIE_NAME}={session_key}".encode(),
                )
            )

        return WebsocketCommunicator(
            AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
            "/ws/inbox/",
            headers=headers,
        )

    def test_anonymous_connection_is_rejected(self):
        async def scenario():
            communicator = self._communicator()
            connected, _ = await communicator.connect()
            self.assertFalse(connected)
            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_authenticated_connection_receives_own_messages(self):
        async def scenario():
            communicator = self._communicator(self.session_key)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            await communicator.send_json_to({"type": "ping"})
            self.assertEqual(await communicator.receive_json_from(), {"type": "pong"})

            await database_sync_to_async(create_message)(
                self.conversation,
                self.awa,
                "Bonjour en temps réel",
            )
            event = await communicator.receive_json_from(timeout=3)
            self.assertEqual(event["type"], "message.created")
            self.assertEqual(event["message"]["body"], "Bonjour en temps réel")
            self.assertEqual(event["conversationId"], str(self.conversation.pk))

            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_invalid_frame_gets_a_clean_error(self):
        async def scenario():
            communicator = self._communicator(self.session_key)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            await communicator.send_to(text_data="{pas du json")
            event = await communicator.receive_json_from(timeout=3)
            self.assertEqual(event["type"], "error")

            await communicator.disconnect()

        async_to_sync(scenario)()

    def test_deleted_session_closes_socket_on_next_ping(self):
        async def scenario():
            communicator = self._communicator(self.session_key)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            await database_sync_to_async(Session.objects.all().delete)()
            await communicator.send_json_to({"type": "ping"})
            output = await communicator.receive_output(timeout=3)
            self.assertEqual(output["type"], "websocket.close")
            self.assertEqual(output["code"], 4401)

        async_to_sync(scenario)()

    def test_logout_closes_the_connected_socket(self):
        async def scenario():
            communicator = self._communicator(self.session_key)
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            response = await database_sync_to_async(self.http_client.post)(
                "/api/auth/logout/"
            )
            self.assertEqual(response.status_code, 204)

            output = await communicator.receive_output(timeout=3)
            self.assertEqual(output["type"], "websocket.close")
            self.assertEqual(output["code"], 4401)

        async_to_sync(scenario)()

    def test_logout_leaves_other_sessions_connected(self):
        other_client = Client()
        other_client.force_login(self.awa)
        other_key = other_client.cookies[settings.SESSION_COOKIE_NAME].value
        self.assertNotEqual(other_key, self.session_key)

        async def scenario():
            current = self._communicator(self.session_key)
            other = self._communicator(other_key)
            self.assertTrue((await current.connect())[0])
            self.assertTrue((await other.connect())[0])

            response = await database_sync_to_async(self.http_client.post)(
                "/api/auth/logout/"
            )
            self.assertEqual(response.status_code, 204)

            output = await current.receive_output(timeout=3)
            self.assertEqual(output["type"], "websocket.close")
            self.assertEqual(output["code"], 4401)

            await other.send_json_to({"type": "ping"})
            self.assertEqual(
                await other.receive_json_from(timeout=3),
                {"type": "pong"},
            )

            await other.disconnect()

        async_to_sync(scenario)()
