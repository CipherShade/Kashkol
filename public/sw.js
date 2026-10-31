/* Kashkol Service Worker — Offline Shell & Lock-Screen-Safe Web Push */
const CACHE_NAME = "kashkol-shell-v1";
const PRECACHE_URLS = [
  "/manifest.json",
  "/icon.svg",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API, auth, health probes, or portal data responses to protect student/family privacy.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/healthz") ||
    url.pathname.startsWith("/readyz")
  ) {
    return;
  }

  // Static icon/manifest assets: cache-first with network fallback.
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
  }
});

self.addEventListener("push", (event) => {
  // Default generic lock-screen-safe payload — never exposes grades, marks, or PII on a locked screen.
  let payload = {
    title: "Kashkol — كشكول",
    body: "لديك إشعار جديد في البوابة. افتح كشكول لعرض التفاصيل بأمان. / You have a new update in your portal.",
    url: "/ar/portal/parent",
    tag: "kashkol-portal-update",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.title === "string" && parsed.title.trim()) {
          payload.title = parsed.title.trim().slice(0, 120);
        }
        if (typeof parsed.body === "string" && parsed.body.trim()) {
          payload.body = parsed.body.trim().slice(0, 240);
        }
        if (
          typeof parsed.url === "string" &&
          parsed.url.startsWith("/") &&
          !parsed.url.startsWith("//")
        ) {
          payload.url = parsed.url;
        }
        if (typeof parsed.tag === "string" && parsed.tag.trim()) {
          payload.tag = parsed.tag.trim().slice(0, 64);
        }
      }
    } catch {
      // Fallback to generic lock-screen-safe notification when payload is not JSON.
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: payload.tag,
      renotify: false,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/ar/portal/parent";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
