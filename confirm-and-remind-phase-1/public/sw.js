// Service worker: receives Web Push and opens the exact task when a notification is tapped.
// It does not schedule anything: reminders are sent by the server (see /api/cron/dispatch).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Confirm & Remind";
  const options = {
    body: data.body || "You have a reminder. Open Confirm & Remind.",
    tag: data.tag || "reminder",
    icon: "/icon.svg",
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
