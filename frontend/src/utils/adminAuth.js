import axios from 'axios'

export const ADMIN_TOKEN_KEY = 'winandchit_admin_token'
export const ADMIN_USER_KEY = 'winandchit_admin_user'

export function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || ''
  } catch (error) {
    console.error('Could not read the admin session:', error)
    return ''
  }
}

export function getStoredAdmin() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_USER_KEY) || 'null')
  } catch (error) {
    console.error('Could not read the admin profile:', error)
    return null
  }
}

export function saveAdminSession(token, admin) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(admin))
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  localStorage.removeItem(ADMIN_USER_KEY)
}

export async function openAdminReceipt(url) {
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('Popup blocked')

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not open receipt (${response.status})`)

    if (url.endsWith('.pdf')) {
      const objectUrl = URL.createObjectURL(await response.blob())
      popup.location.replace(objectUrl)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } else {
      popup.document.open()
      popup.document.write(await response.text())
      popup.document.close()
    }
  } catch (error) {
    popup.close()
    throw error
  }
}

axios.interceptors.request.use(config => {
  const token = getAdminToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  } else if (config.headers?.Authorization) {
    delete config.headers.Authorization
  }
  return config
})

if (typeof window !== 'undefined' && !window.__winAndChitAdminFetchInstalled) {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input, init = {}) => {
    let url
    try {
      url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.href)
    } catch (error) {
      return originalFetch(input, init)
    }
    const token = getAdminToken()
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/') || !token) {
      return originalFetch(input, init)
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value))
    headers.set('Authorization', `Bearer ${token}`)
    return originalFetch(input, { ...init, headers })
  }
  window.__winAndChitAdminFetchInstalled = true
}
