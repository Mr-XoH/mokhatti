// ═══════════════════════════════════════
// مخططي — Service Worker v4
// Real offline notifications + caching
// ═══════════════════════════════════════

const CACHE_NAME = 'mokhatti-v4';
const ASSETS = ['/', '/index.html'];

// ── Install & Cache ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Activate & Clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: Cache First ──
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ── Notification Click ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// ── Schedule Alarm Messages from app ──
// The app posts messages to SW to schedule notifications
const scheduledAlarms = new Map();

self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  if (type === 'SCHEDULE_NOTIFICATIONS') {
    // Clear old alarms
    scheduledAlarms.forEach(tid => clearTimeout(tid));
    scheduledAlarms.clear();

    const slots = payload.slots || [];
    const now = Date.now();

    slots.forEach(slot => {
      if (!slot.reminder || slot.reminder == 0) return;
      const DAY_NAMES = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

      // Schedule for next 14 days
      for (let d = 0; d < 14; d++) {
        const target = new Date();
        target.setDate(target.getDate() + d);
        if (target.getDay() !== parseInt(slot.day)) continue;

        const [h, m] = slot.from.split(':');
        target.setHours(parseInt(h), parseInt(m) - parseInt(slot.reminder), 0, 0);

        const diff = target.getTime() - now;
        if (diff <= 0) continue;
        if (diff > 14 * 24 * 3600 * 1000) continue;

        const key = slot.id + '_' + d;
        const tid = setTimeout(() => {
          self.registration.showNotification('📚 ' + slot.subject, {
            body: 'الحصة تبدأ خلال ' + slot.reminder + ' دقيقة' +
                  (slot.location ? '\n📍 ' + slot.location : '') +
                  (slot.scheduleName ? '\n📋 ' + slot.scheduleName : ''),
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: key,
            renotify: false,
            requireInteraction: true,
            data: { url: '/' }
          });
          scheduledAlarms.delete(key);
        }, diff);

        scheduledAlarms.set(key, tid);
      }
    });

    // Reply with count
    event.ports[0]?.postMessage({ scheduled: scheduledAlarms.size });
  }

  if (type === 'CLEAR_NOTIFICATIONS') {
    scheduledAlarms.forEach(tid => clearTimeout(tid));
    scheduledAlarms.clear();
  }

  if (type === 'TEST_NOTIFICATION') {
    self.registration.showNotification('🔔 مخططي', {
      body: 'الإشعارات تعمل بشكل صحيح ✓',
      icon: '/icon-192.png',
      requireInteraction: false,
    });
  }
});
