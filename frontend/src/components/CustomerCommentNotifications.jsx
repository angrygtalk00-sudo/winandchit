import React, { useEffect, useRef, useState } from 'react'
import { Bell, MessageCircle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { playCommentNotificationSound, triggerNotificationVibration } from '../utils/chatAudio'

const READ_KEY = 'winandchit_product_comment_notification_reads'
const USER_KEY = 'winandchit_auth_user'

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') || fallback } catch { return fallback }
}

function getProductId(item) {
  const value = item?.productContext?.productId || item?.productId?._id || item?.productId
  return value && typeof value === 'object' ? String(value._id || '') : String(value || '')
}

function getProductUrl(item) {
  const productId = getProductId(item)
  const sku = String(item?.productContext?.sku || '')
  if (!productId) return ''
  const params = new URLSearchParams()
  if (sku) params.set('sku', sku)
  if (item?._id) params.set('commentId', String(item._id))
  return `/product/${productId}${params.size ? `?${params}` : ''}`
}

export default function CustomerCommentNotifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const initializedRef = useRef(false)
  const observedAdminReplyIdsRef = useRef(new Set())
  const observedCustomerIdRef = useRef('')

  const getNotificationContext = () => {
    const user = readJson(USER_KEY, null)
    const customerUserId = String(user?.id || user?._id || '')
    return { customerUserId, password: user?.password || '' }
  }

  const loadNotifications = async () => {
    const context = getNotificationContext()
    if (!context.customerUserId || !context.password) {
      observedCustomerIdRef.current = ''
      observedAdminReplyIdsRef.current = new Set()
      initializedRef.current = false
      setNotifications([])
      return
    }
    if (observedCustomerIdRef.current !== context.customerUserId) {
      observedCustomerIdRef.current = context.customerUserId
      observedAdminReplyIdsRef.current = new Set()
      initializedRef.current = false
      setNotifications([])
    }
    try {
      const response = await fetch('/api/product-comments/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context)
      })
      if (!response.ok) return
      const next = await response.json()
      const readIds = new Set(readJson(READ_KEY, []))
      const newReplyIds = next.filter(item => item.isAdmin && !item.readByCustomerAt && !readIds.has(String(item._id))).map(item => String(item._id))
      if (initializedRef.current && newReplyIds.some(id => !observedAdminReplyIdsRef.current.has(id))) {
        playCommentNotificationSound()
        triggerNotificationVibration([70, 45, 110])
      }
      observedAdminReplyIdsRef.current = new Set(next.filter(item => item.isAdmin).map(item => String(item._id)))
      initializedRef.current = true
      setNotifications(next)
    } catch (err) {
      console.error('Could not load customer comment notifications:', err)
    }
  }

  const markRead = items => {
    const context = getNotificationContext()
    if (!context.customerUserId || !context.password) return
    const readIds = new Set(readJson(READ_KEY, []))
    const unpersistedItems = items.filter(item => item.isAdmin && !item.readByCustomerAt)
    if (unpersistedItems.length === 0) return

    const notificationIds = unpersistedItems.map(item => String(item._id))
    notificationIds.forEach(id => readIds.add(id))
    try { localStorage.setItem(READ_KEY, JSON.stringify([...readIds].slice(-1000))) } catch (err) {}

    const markedAt = new Date().toISOString()
    setNotifications(current => current.map(item => notificationIds.includes(String(item._id))
      ? { ...item, readByCustomerAt: markedAt }
      : item))

    fetch('/api/product-comments/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...context,
        notificationIds
      })
    }).then(response => {
      if (!response.ok) throw new Error(`Notification read update failed with status ${response.status}`)
    }).catch(err => {
      console.error('Could not mark customer comment notifications as read:', err)
    })
  }

  useEffect(() => {
    loadNotifications()
    const timer = window.setInterval(loadNotifications, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const readIds = new Set(readJson(READ_KEY, []))
  const unreadNotifications = notifications.filter(item => item.isAdmin && !readIds.has(String(item._id)))
  const unreadCount = unreadNotifications.filter(item => !item.readByCustomerAt).length
  const customerNotifications = notifications.filter(item => item.isAdmin)
  const toggleNotifications = () => {
    if (!open) markRead(customerNotifications)
    setOpen(current => !current)
  }
  const openNotification = item => {
    markRead([item])
    setOpen(false)
    const productUrl = getProductUrl(item)
    if (productUrl) navigate(productUrl)
  }

  return <div className="customer-notifications">
    <button type="button" className={`customer-notification-bell ${unreadCount ? 'has-unread' : ''}`} aria-label={`Comment notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} title="Comment notifications" aria-expanded={open} onClick={toggleNotifications}>
      <Bell size={18} />
      {unreadCount > 0 && <span>{unreadCount}</span>}
    </button>
    {open && <div className="customer-notification-menu">
      <div className="customer-notification-menu-head"><strong>Notifications</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={16} /></button></div>
      {customerNotifications.length === 0 ? <p>No notifications yet.</p> : customerNotifications.map(item => {
        const isRead = Boolean(item.readByCustomerAt || readIds.has(String(item._id)))
        return <button type="button" className={`customer-notification-item reply ${isRead ? '' : 'unread'}`} key={item._id} onClick={() => openNotification(item)}><MessageCircle size={15} /><span><strong>Win &amp; Chit replied</strong><small>{item.text}</small><small>{new Date(item.createdAt).toLocaleString()}</small></span></button>
      })}
    </div>}
  </div>
}