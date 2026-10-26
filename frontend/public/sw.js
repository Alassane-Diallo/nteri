self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : "N’Teri";
  const body = typeof payload.body === "string" ? payload.body : "";
  const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
  const tag =
    typeof payload.tag === "string" ? payload.tag : "nteri-message";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const visible = windows.some(
        (client) =>
          client.focused === true && client.visibilityState === "visible",
      );
      if (visible) {
        return;
      }

      await self.registration.showNotification(title, {
        body,
        tag,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { chatId },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;
  const target = chatId
    ? `/?chat=${encodeURIComponent(chatId)}`
    : "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        await existing.focus();
        if (chatId) {
          existing.postMessage({ type: "nteri:open-chat", chatId });
        }
        return;
      }

      await self.clients.openWindow(target);
    })(),
  );
});
