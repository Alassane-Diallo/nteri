from __future__ import annotations

import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone


class InboxConsumer(AsyncWebsocketConsumer):
    """Flux temps réel personnel.

    L'utilisateur est identifié par sa session Django, jamais par un
    identifiant fourni dans l'URL. Le canal ne reçoit que des messages de
    conversation auxquels il participe.
    """

    MAX_FRAME_SIZE = 4 * 1024

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.user_id = user.pk
        self.group_name = f"user_{self.user_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.mark_seen()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
        if hasattr(self, "user_id"):
            await self.mark_seen()

    async def receive(self, text_data=None, bytes_data=None):
        if bytes_data is not None:
            await self.close(code=4400)
            return

        payload = text_data or ""
        if len(payload) > self.MAX_FRAME_SIZE:
            await self.close(code=4409)
            return

        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            await self.send_json(
                {"type": "error", "detail": "Message JSON invalide."}
            )
            return

        if not isinstance(event, dict):
            await self.send_json(
                {"type": "error", "detail": "Format de message invalide."}
            )
            return

        if event.get("type") == "ping":
            if not await self.session_is_valid():
                await self.close(code=4401)
                return
            await self.send_json({"type": "pong"})
            return

        await self.send_json(
            {
                "type": "error",
                "detail": "Cette action n’est pas prise en charge.",
            }
        )

    async def chat_event(self, event):
        payload = event["payload"]
        if payload.get("type") == "session.ended":
            target_key = payload.get("sessionKey")
            current_key = getattr(self.scope.get("session"), "session_key", None)
            if target_key is None or (
                current_key is not None and current_key == target_key
            ):
                await self.close(code=4401)
            return

        await self.send_json(payload)

    async def send_json(self, content: dict):
        await self.send(text_data=json.dumps(content))

    @database_sync_to_async
    def session_is_valid(self) -> bool:
        from django.contrib.sessions.models import Session

        from .models import User

        session = self.scope.get("session")
        session_key = getattr(session, "session_key", None)
        if not session_key:
            return False

        return (
            User.objects.filter(pk=self.user_id, is_active=True).exists()
            and Session.objects.filter(
                session_key=session_key,
                expire_date__gt=timezone.now(),
            ).exists()
        )

    @database_sync_to_async
    def mark_seen(self):
        from .models import User

        User.objects.filter(pk=self.user_id).update(last_seen=timezone.now())
