self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'winandchit-push', payload }));
    const appIsVisible = clients.some(client => client.visibilityState === 'visible');
    if (!appIsVisible) {
      await self.registration.showNotification(payload.title || 'Win & Chit', {
        body: payload.body || 'You have a new update.',
        icon: '/assets/winandchit-logo.png',
        badge: '/assets/winandchit-logo.png',
        tag: payload.tag || 'winandchit-update',
        data: { url: payload.url || '/' }
      });
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingClient = clients[0];
    if (existingClient) {
      await existingClient.focus();
      existingClient.postMessage({ type: 'winandchit-push-open', url: targetUrl });
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});