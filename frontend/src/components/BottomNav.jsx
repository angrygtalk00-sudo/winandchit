import React, { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, MessageCircle, ShoppingCart, User } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { playNotificationSound, showDesktopNotification } from '../utils/chatAudio'

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/message', label: 'Message', icon: MessageCircle },
  { to: '/cart', label: 'Cart', icon: ShoppingCart },
  { to: '/account', label: 'Account', icon: User }
]

export default function BottomNav() {
  const { totalCount } = useCart()
  const location = useLocation()
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const prevCountRef = useRef(0)

  // Poll for customer unread replies from support
  useEffect(() => {
    let convoId = ''
    try {
      const stored = localStorage.getItem('winandchit_auth_user')
      if (stored) {
        const u = JSON.parse(stored)
        convoId = u?.id || u?._id ? `user_${u.id || u._id}` : ''
      }
      if (!convoId) {
        convoId = localStorage.getItem('winandchit_guest_chat_id') || ''
      }
    } catch (e) {}

    if (!convoId) return

    const checkUnread = async () => {
      // If user is currently looking at /message, unread badge is automatically 0
      if (location.pathname === '/message') {
        setUnreadMsgCount(0)
        prevCountRef.current = 0
        return
      }

      try {
        const res = await fetch(`/api/chat/customer-unread?conversationId=${encodeURIComponent(convoId)}`)
        if (res.ok) {
          const data = await res.json()
          const count = Number(data.unreadCount || 0)
          if (count > prevCountRef.current && count > 0) {
            playNotificationSound()
            showDesktopNotification('Win & Chit Support Reply', {
              body: 'You received a new reply from customer support! Tap to open.'
            })
          }
          prevCountRef.current = count
          setUnreadMsgCount(count)
        }
      } catch (e) {}
    }

    checkUnread()
    const timer = setInterval(checkUnread, 5000)
    return () => clearInterval(timer)
  }, [location.pathname])

  return (
    <nav className="bottom-nav" aria-label="Shop navigation">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          onClick={(e) => {
            // Ask Catalog to snapshot its last measured scroll before route teardown.
            if (location.pathname === '/') {
              try { window.dispatchEvent(new CustomEvent('catalogSaveScroll')) } catch (err) {}
            }

            // Sequential re-tap behavior: whenever Home is tapped while already on Home, emit reset event.
            if (to === '/' && location.pathname === '/') {
              try { window.dispatchEvent(new CustomEvent('homeReselect')) } catch (err) {}
            }
          }}
        >
          <span className="bottom-nav-icon-wrap">
            <Icon size={22} strokeWidth={2.1} />
            {to === '/cart' && totalCount > 0 && <span className="bottom-nav-badge">{totalCount > 99 ? '99+' : totalCount}</span>}
            {to === '/message' && unreadMsgCount > 0 && (
              <span className="bottom-nav-badge msg-badge">
                {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
              </span>
            )}
          </span>
          <span className="bottom-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
