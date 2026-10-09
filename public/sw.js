// CMCG service worker: shows lead alerts even when the app is closed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "CMCG", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "🔥 رسالة جديدة";
  const options = {
    body: data.body || "",
    tag: data.tag || "cmcg",
    renotify: true,             // ring again even if the same lead is already shown
    requireInteraction: true,   // stays on screen until tapped (desktop / Android)
    vibrate: [400, 150, 400, 150, 400, 150, 800],
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    dir: "rtl",
    lang: "ar",
    timestamp: Date.now(),
    data: { url: data.url || "/#view=leads", phone: data.phone || "" },
    actions: data.phone && !data.admin ? [{ action: "call", title: "📞 اتصلي الآن" }, { action: "open", title: "فتح" }] : [],
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    // Tell open tabs so they can ring the in-app alarm too.
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => clients.forEach((client) => client.postMessage({ type: "cmcg-push", data }))),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url, phone } = event.notification.data || {};
  const target = event.action === "call" && phone ? `/#view=leads&call=${encodeURIComponent(phone)}` : (url || "/#view=leads");
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      open.postMessage({ type: "cmcg-open", url: target });
      return;
    }
    await self.clients.openWindow(target);
  })());
});
