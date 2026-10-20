// Service worker de GiftR: solo muestra los avisos push (codazos). No cachea nada.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let aviso = {}
  try {
    aviso = event.data ? event.data.json() : {}
  } catch {
    aviso = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(self.registration.showNotification(aviso.title || 'GiftR', {
    body: aviso.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'giftr-codazo',
    renotify: true,
    data: { url: aviso.url || '/' },
  }))
})

// Al tocar el aviso: si GiftR ya está abierto, lo trae adelante en esa pantalla; si no, lo abre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const v of ventanas) {
      if (new URL(v.url).origin !== self.location.origin) continue
      try { await v.navigate(url) } catch { /* una ventana que no controla este SW no se puede navegar */ }
      return v.focus()
    }
    return self.clients.openWindow(url)
  })())
})
