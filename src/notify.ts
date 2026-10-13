import type { Nudge } from '@shared/types'

export function showLocalNudge(nudge: Nudge, chaseId: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const notice = new Notification(nudge.title, { body: nudge.body, tag: chaseId })
    notice.onclick = () => {
      window.focus()
      window.location.hash = `#/chase/${chaseId}`
    }
  } catch {
    // The in-app row still shows the due stage.
  }
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function enableReminders(
  save: (json: PushSubscriptionJSON) => Promise<void>,
  cloud: boolean,
): Promise<string> {
  if (typeof Notification === 'undefined') return 'This browser does not show notifications.'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Notifications are blocked in the browser settings.'
  if (!cloud) return 'Reminders will show while Chase is open on this device.'

  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!key || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'Reminders will show while Chase is open. Add a VAPID key to ping this device after you close it.'
  }

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration | null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ])
  if (!registration) {
    return 'Reminders will show while Chase is open. Install Chase to receive them after you close it.'
  }

  try {
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }))
    await save(subscription.toJSON())
    return 'This device will get reminders after Chase is closed, once the scheduler is running.'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Push setup failed.'
    return `Reminders will show while Chase is open. ${message}`
  }
}
