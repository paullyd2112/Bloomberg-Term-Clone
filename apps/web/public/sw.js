// Plebs.finance service worker — handles web push notifications.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Plebs Alert", body: event.data.text() };
  }

  const title = payload.title || "Plebs Alert";
  const options = {
    body: payload.body || "",
    icon: "/logo-icon.png",
    badge: "/logo-icon.png",
    data: { url: payload.url || "/dashboard" },
    tag: payload.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is open
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
