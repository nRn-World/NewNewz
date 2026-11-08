// Service worker: offline app shell + Web Push background notifications for saved addresses, cities & countries.
const CACHE = 'newzlocal-v3'
const PRECACHE = ['./', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin || /\/(gn|bn|rd|fb|gnews|nd|push|meta|eksi|meneame)\//.test(u.pathname)) return

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.ok) {
            const c = r.clone()
            caches.open(CACHE).then((x) => x.put('./', c))
          }
          return r
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((hit) => {
        const net = fetch(e.request)
          .then((r) => {
            if (r.ok) cache.put(e.request, r.clone())
            return r
          })
          .catch(() => hit)
        return hit || net
      }),
    ),
  )
})

// Background Web Push notifications (dispatched by the Cloudflare Worker Cron trigger)
self.addEventListener('push', (e) => {
  let data = { title: 'NewzLocal', body: '', url: './', tag: 'newzlocal' }
  try {
    if (e.data) data = { ...data, ...e.data.json() }
  } catch {
    if (e.data) data.body = e.data.text()
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: data.tag,
      renotify: true,
      vibrate: [180, 80, 180],
      data: { url: data.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const rawUrl = e.notification.data?.url || './'
  const targetUrl = new URL(rawUrl, self.registration.scope).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.postMessage({ type: 'OPEN_ALERT_PLACE', url: targetUrl })
          client.navigate?.(targetUrl).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
