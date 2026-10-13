/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

const inScope = (file: string) => new URL(file, self.registration.scope).href
registerRoute(new NavigationRoute(createHandlerBoundToURL(inScope('index.html'))))

interface PushBody {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  const payload: PushBody = event.data ? (event.data.json() as PushBody) : {}
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Chase', {
      body: payload.body || '',
      icon: inScope('icon-192.png'),
      badge: inScope('icon-192.png'),
      tag: payload.tag,
      data: { url: payload.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const raw = (event.notification.data as { url?: string } | undefined)?.url || './'
  const target = new URL(raw.startsWith('/') ? raw.slice(1) : raw, self.registration.scope).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
