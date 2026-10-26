from __future__ import annotations

import re
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

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

from .models import (
    AuthAttempt,
    Contact,
    Conversation,
    Message,
    OtpChallenge,
    PushSubscription,
    User,
)
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

    def request_code(self, client, token: str, phone: str) -> str:
        with patch("chat.otp.send_sms") as send_sms:
            response = client.post(
                "/api/auth/otp/request/",
                {"phone": phone},
                format="json",
                HTTP_X_CSRFTOKEN=token,
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(send_sms.called)
        message = send_sms.call_args.args[1]
        match = re.search(r"\b(\d{6})\b", message)
        self.assertIsNotNone(match)

        return match.group(1)

    def test_csrf_is_required_for_otp_request(self):
        client = APIClient(enforce_csrf_checks=True)
        denied = client.post(
            "/api/auth/otp/request/",
            {"phone": "+22376123456"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        token = client.get("/api/auth/csrf/").data["csrfToken"]
        with patch("chat.otp.send_sms"):
            allowed = client.post(
                "/api/auth/otp/request/",
                {"phone": "+22376123456"},
                format="json",
                HTTP_X_CSRFTOKEN=token,
            )
        self.assertEqual(allowed.status_code, 200)

    def test_existing_user_logs_in_with_phone_and_otp(self):
        client, token = self.csrf_client()
        code = self.request_code(client, token, "76 12 34 56")

        verified = client.post(
            "/api/auth/otp/verify/",
            {"phone": "+22376123456", "code": code},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertEqual(verified.data["user"]["username"], "awa")
        self.assertFalse(verified.data["isNewAccount"])

        me = client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "awa")

        self.assertEqual(
            client.post(
                "/api/auth/logout/",
                HTTP_X_CSRFTOKEN=verified.data["csrfToken"],
            ).status_code,
            204,
        )
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_unknown_phone_creates_account_after_name(self):
        client, token = self.csrf_client()
        code = self.request_code(client, token, "+22375086321")

        needs_name = client.post(
            "/api/auth/otp/verify/",
            {"phone": "+22375086321", "code": code},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(needs_name.status_code, 400)
        self.assertTrue(needs_name.data["requiresName"])

        created = client.post(
            "/api/auth/otp/verify/",
            {
                "phone": "+22375086321",
                "code": code,
                "name": "Fatoumata Keïta",
            },
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(created.status_code, 200, created.data)
        self.assertTrue(created.data["isNewAccount"])
        self.assertEqual(created.data["user"]["name"], "Fatoumata Keïta")

        user = User.objects.get(phone="+22375086321")
        self.assertTrue(user.username.startswith("nteri_"))
        self.assertFalse(user.has_usable_password())

    def test_wrong_code_is_rejected_and_limited(self):
        client, token = self.csrf_client()
        code = self.request_code(client, token, "+22376123456")
        wrong_code = "000000" if code != "000000" else "111111"

        for _ in range(5):
            response = client.post(
                "/api/auth/otp/verify/",
                {"phone": "+22376123456", "code": wrong_code},
                format="json",
                HTTP_X_CSRFTOKEN=token,
            )
            self.assertEqual(response.status_code, 400)

        valid_after_limit = client.post(
            "/api/auth/otp/verify/",
            {"phone": "+22376123456", "code": code},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(valid_after_limit.status_code, 400)
        self.assertIsNotNone(OtpChallenge.objects.first().consumed_at)

    def test_expired_code_is_rejected(self):
        client, token = self.csrf_client()
        code = self.request_code(client, token, "+22376123456")
        OtpChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

        response = client.post(
            "/api/auth/otp/verify/",
            {"phone": "+22376123456", "code": code},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 400)

    def test_otp_requests_are_rate_limited(self):
        client, token = self.csrf_client()
        statuses = []
        with patch("chat.otp.send_sms"):
            for _ in range(4):
                statuses.append(
                    client.post(
                        "/api/auth/otp/request/",
                        {"phone": "+22376123456"},
                        format="json",
                        HTTP_X_CSRFTOKEN=token,
                    ).status_code
                )

        self.assertEqual(statuses[:3], [200, 200, 200])
        self.assertEqual(statuses[3], 429)

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
        Contact.objects.create(owner=self.awa, contact=self.moussa)
        Contact.objects.create(owner=self.awa, contact=self.fatoumata)
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

    def test_contacts_are_private_to_their_owner(self):
        moussa_client = APIClient()
        moussa_client.force_authenticate(self.moussa)

        self.assertEqual(moussa_client.get("/api/contacts/").data, [])
        self.assertIn(
            str(self.moussa.pk),
            {
                contact["id"]
                for contact in self.client.get("/api/contacts/").data
            },
        )

    def test_contact_deletion_only_affects_own_book(self):
        Contact.objects.create(owner=self.moussa, contact=self.awa)

        response = self.client.delete(f"/api/contacts/{self.moussa.pk}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            Contact.objects.filter(
                owner=self.awa,
                contact=self.moussa,
            ).exists()
        )
        self.assertTrue(
            Contact.objects.filter(
                owner=self.moussa,
                contact=self.awa,
            ).exists()
        )

    def test_contact_can_be_added_by_phone(self):
        oumar = make_user("oumar", "Oumar", "Sissoko", "+22366540933")

        response = self.client.post(
            "/api/contacts/",
            {"phone": "66 54 09 33", "name": "Oumar du quartier"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["id"], str(oumar.pk))
        self.assertEqual(response.data["name"], "Oumar du quartier")

        again = self.client.post(
            "/api/contacts/",
            {"phone": "+22366540933"},
            format="json",
        )
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["name"], "Oumar du quartier")

    def test_unknown_phone_and_self_cannot_be_added(self):
        unknown = self.client.post(
            "/api/contacts/",
            {"phone": "+22399999999"},
            format="json",
        )
        self.assertEqual(unknown.status_code, 404)

        current = self.client.post(
            "/api/contacts/",
            {"phone": "+22376123456"},
            format="json",
        )
        self.assertEqual(current.status_code, 400)

    def test_conversation_creation_requires_a_saved_contact(self):
        oumar = make_user("oumar", "Oumar", "Sissoko", "+22366540933")

        direct = self.client.post(
            "/api/conversations/",
            {"kind": "direct", "memberIds": [str(oumar.pk)]},
            format="json",
        )
        self.assertEqual(direct.status_code, 400)

        group = self.client.post(
            "/api/conversations/",
            {
                "kind": "group",
                "name": "Groupe fermé",
                "memberIds": [str(self.moussa.pk), str(oumar.pk)],
            },
            format="json",
        )
        self.assertEqual(group.status_code, 400)

    @override_settings(VAPID_PUBLIC_KEY="", VAPID_PRIVATE_KEY="")
    def test_push_config_is_disabled_without_keys(self):
        response = self.client.get("/api/push/config/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["enabled"])
        self.assertEqual(response.data["publicKey"], "")

    @override_settings(
        VAPID_PUBLIC_KEY="public-key",
        VAPID_PRIVATE_KEY="private-key",
    )
    def test_push_config_exposes_public_key(self):
        response = self.client.get("/api/push/config/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["enabled"])
        self.assertEqual(response.data["publicKey"], "public-key")

    def test_push_subscription_can_be_saved_and_removed(self):
        payload = {
            "endpoint": "https://fcm.googleapis.com/subscription/123",
            "keys": {
                "p256dh": "cle-publique-navigateur",
                "auth": "secret-navigateur",
            },
        }
        response = self.client.post(
            "/api/push/subscribe/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        subscription = PushSubscription.objects.get()
        self.assertEqual(subscription.user, self.awa)
        self.assertEqual(subscription.p256dh, "cle-publique-navigateur")

        removed = self.client.post(
            "/api/push/unsubscribe/",
            {"endpoint": payload["endpoint"]},
            format="json",
        )
        self.assertEqual(removed.status_code, 204)
        self.assertFalse(PushSubscription.objects.exists())

    def test_push_subscription_rejects_non_https_endpoint(self):
        response = self.client.post(
            "/api/push/subscribe/",
            {
                "endpoint": "http://push.example.com/subscription/123",
                "keys": {"p256dh": "cle", "auth": "secret"},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_push_subscription_rejects_unknown_push_host(self):
        response = self.client.post(
            "/api/push/subscribe/",
            {
                "endpoint": "https://example.com/subscription/123",
                "keys": {"p256dh": "cle", "auth": "secret"},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(
        VAPID_PUBLIC_KEY="public-key",
        VAPID_PRIVATE_KEY="private-key",
    )
    def test_push_is_sent_to_other_participants(self):
        PushSubscription.objects.create(
            user=self.moussa,
            endpoint="https://fcm.googleapis.com/subscription/moussa",
            p256dh="cle",
            auth="secret",
        )
        PushSubscription.objects.create(
            user=self.awa,
            endpoint="https://fcm.googleapis.com/subscription/awa",
            p256dh="cle",
            auth="secret",
        )

        with patch("chat.push.webpush") as webpush:
            create_message(self.conversation, self.awa, "Message notifié")

        webpush.assert_called_once()
        subscription_info = webpush.call_args.kwargs["subscription_info"]
        self.assertEqual(
            subscription_info["endpoint"],
            "https://fcm.googleapis.com/subscription/moussa",
        )

    @override_settings(VAPID_PUBLIC_KEY="", VAPID_PRIVATE_KEY="")
    def test_push_is_not_sent_without_vapid_keys(self):
        PushSubscription.objects.create(
            user=self.moussa,
            endpoint="https://fcm.googleapis.com/subscription/moussa",
            p256dh="cle",
            auth="secret",
        )

        with patch("chat.push.webpush") as webpush:
            create_message(self.conversation, self.awa, "Sans push")

        webpush.assert_not_called()

    @override_settings(
        VAPID_PUBLIC_KEY="public-key",
        VAPID_PRIVATE_KEY="private-key",
    )
    def test_logout_removes_push_subscriptions(self):
        PushSubscription.objects.create(
            user=self.awa,
            endpoint="https://fcm.googleapis.com/subscription/awa",
            p256dh="cle",
            auth="secret",
        )

        self.assertEqual(
            self.client.post("/api/auth/logout/").status_code,
            204,
        )
        self.assertFalse(PushSubscription.objects.exists())

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
