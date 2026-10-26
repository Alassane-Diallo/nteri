import { pushApi } from "~/features/messaging/api";

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

async function registrationForPush(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

async function saveSubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<boolean> {
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch {
      return false;
    }
  }

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    return false;
  }

  await pushApi.subscribe({
    endpoint: json.endpoint,
    keys: { p256dh, auth },
  });

  return true;
}

/** Enregistre le service worker et l'abonnement Push si tout est configuré. */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") {
    return false;
  }

  let config;
  try {
    config = await pushApi.config();
  } catch {
    return false;
  }
  if (!config.enabled || !config.publicKey) {
    return false;
  }

  const registration = await registrationForPush();
  if (!registration) {
    return false;
  }

  try {
    return await saveSubscription(registration, config.publicKey);
  } catch {
    return false;
  }
}

/** Demande l'autorisation puis active les notifications Push. */
export async function registerPushNotifications(): Promise<boolean> {
  if (!pushSupported()) {
    return false;
  }
  if (Notification.permission !== "granted") {
    return false;
  }

  return ensurePushSubscription();
}

/** Retire l'abonnement local et côté serveur avant une déconnexion. */
export async function unregisterPushNotifications(): Promise<void> {
  if (!pushSupported()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      return;
    }

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await pushApi.unsubscribe(endpoint);
  } catch {
    // La déconnexion doit rester possible même si le navigateur échoue.
  }
}
