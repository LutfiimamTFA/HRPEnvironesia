/* HRP Environesia — Web Push background handler (Firebase Cloud Messaging).
 * Runs even when the HRP tab is closed / the user is logged out — this file
 * must not import anything that depends on the logged-in session. Config
 * values below mirror src/firebase/config.ts (already public in the client
 * bundle, not a secret).
 */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  projectId: 'studio-9262077557-bc9c9',
  appId: '1:80532457942:web:b370536157cf3450243c77',
  storageBucket: 'studio-9262077557-bc9c9.firebasestorage.app',
  apiKey: 'AIzaSyDqMdXWhOikeYNqJo9XTMvZ63Hmmgixsfk',
  authDomain: 'studio-9262077557-bc9c9.firebaseapp.com',
  messagingSenderId: '80532457942',
});

const messaging = firebase.messaging();

// Generic, non-sensitive content only — this can render on a locked screen.
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'HRP Environesia';
  const body = payload?.notification?.body || 'Anda memiliki notifikasi baru.';
  const url = payload?.data?.url || '/admin';

  self.registration.showNotification(title, {
    body,
    icon: '/images/logo.png',
    badge: '/images/logo.png',
    data: { url },
    tag: payload?.data?.tag || 'hrp-notification',
  });
});

// Clicking the push (tab closed, or user logged out) opens the target page —
// if the user is logged out, the app's own auth guard takes over and sends
// them to /admin/login?returnUrl=<this page>, then back here after login.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/admin';

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin && 'focus' in client) {
            await client.focus();
            if ('navigate' in client) await client.navigate(targetUrl);
            return;
          }
        } catch {
          // ignore and try the next client
        }
      }
      await clients.openWindow(targetUrl);
    })(),
  );
});
