export type NotificationPermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function currentNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }

  return Notification.permission;
}

export async function enableBrowserNotifications(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

interface MessageNotificationInput {
  title: string;
  body: string;
  chatId: string;
}

export function showMessageNotification({
  title,
  body,
  chatId,
}: MessageNotificationInput): void {
  if (
    typeof window === "undefined" ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
      tag: `nteri-chat-${chatId}`,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    });
    notification.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent("nteri:open-chat", { detail: { chatId } }),
      );
      notification.close();
    };
  } catch {
    // Certains navigateurs refusent la notification sans service worker.
  }
}
