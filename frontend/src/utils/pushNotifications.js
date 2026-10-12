function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const binary = window.atob(base64)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export async function registerPushNotifications(conversationId, requestPermission = false) {
  if (!conversationId || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false

  if (Notification.permission === 'default' && requestPermission) {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false
  }
  if (Notification.permission !== 'granted') return false

  const registration = await navigator.serviceWorker.register('/push-sw.js')
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    const response = await fetch('/api/push/public-key')
    if (!response.ok) return false
    const { publicKey } = await response.json()
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    })
  }

  const response = await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, subscription: subscription.toJSON() })
  })
  return response.ok
}