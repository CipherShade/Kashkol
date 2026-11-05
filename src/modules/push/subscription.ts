export interface PushSubscriptionRecord {
  id: string;
  workspaceId: string;
  portalUserId: string;
  kind: "parent" | "student";
  endpoint: string;
  p256dh: string;
  auth: string;
  includeSensitiveDetails: boolean;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  try {
    const p = await Notification.requestPermission();
    return p === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export function isPermissionDenied(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return true;
  return Notification.permission === "denied";
}

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  if (isPermissionDenied()) return null;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
    return sub;
  } catch {
    return null;
  }
}

export async function unsubscribeFromPush(sub: PushSubscription): Promise<boolean> {
  try {
    await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
