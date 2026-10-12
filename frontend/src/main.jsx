import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink, Outlet, Navigate, useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { ShoppingCart, BarChart3, PackagePlus, BadgePercent, ClipboardList, Settings as SettingsIcon, MoonStar, SunMedium, Store, MessageCircle, MessagesSquare, LogOut } from 'lucide-react'
import axios from 'axios'
import POS from './pages/POS'
import Catalog from './pages/Catalog'
import ProductDetail from './pages/ProductDetail'
import Message from './pages/Message'
import Cart from './pages/Cart'
import Account from './pages/Account'
import AdminDashboard from './pages/AdminDashboard'
import AdminComments from './pages/AdminComments'
import AddProduct from './pages/AddProduct'
import Orders from './pages/Orders'
import Settings from './pages/Settings'
import Discounts from './pages/Discounts'
import AdminLogin from './pages/AdminLogin'
import BottomNav from './components/BottomNav'
import AdminChatModal from './components/AdminChatModal'
import ErrorBoundary from './components/ErrorBoundary'
import { CartProvider } from './context/CartContext'
import { ChatHistoryProvider } from './context/ChatHistoryContext'
import { playNotificationSound, showDesktopNotification, triggerNotificationVibration } from './utils/chatAudio'
import { registerPushNotifications } from './utils/pushNotifications'
import { clearAdminSession, getAdminToken } from './utils/adminAuth'
import './styles.css'

const ADMIN_ROUTE_ORDER = ['/dashboard', '/pos', '/add-product', '/discounts', '/orders', '/settings', '/', '/comments']
const SHOP_ROUTE_ORDER = ['/', '/product/:id', '/message', '/cart', '/account']
const ADMIN_ROUTES = new Set(ADMIN_ROUTE_ORDER.filter(path => path !== '/' && path !== '/comments').concat('/comments'))
const getTransitionDirection = custom => typeof custom === 'number' ? custom : custom.direction
const ROUTE_SLIDE_VARIANTS = {
  enter: custom => ({ opacity: 0, x: getTransitionDirection(custom) > 0 ? 24 : -24 }),
  center: { opacity: 1, x: 0 },
  exit: custom => ({ opacity: 0, x: getTransitionDirection(custom) > 0 ? -18 : 18 })
}
const PRODUCT_ROUTE_VARIANTS = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: custom => ({ opacity: (custom.preserveProductHero || custom.preserveCartPortal) ? 1 : 0 })
}
const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  '[role="button"]',
  '[data-interactive]',
  '.btn',
  '.nav-link',
  '.bottom-nav-item',
  '.product-detail-variant-row'
].join(', ')

function GlobalTouchMist() {
  useEffect(() => {
    let burstCounter = 0
    const onPointerDown = event => {
      if (event.button !== 0 || !event.target?.closest) return
      const target = event.target.closest(INTERACTIVE_SELECTOR)
      if (!target) return
      const burst = document.createElement('span')
      burst.className = 'touch-mist-burst'
      burst.style.left = `${event.clientX}px`
      burst.style.top = `${event.clientY}px`
      burst.style.setProperty('--mist-seed', String((burstCounter++ % 6) + 1))
      document.body.appendChild(burst)
      window.setTimeout(() => burst.remove(), 700)
    }
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])
  return null
}

function getRouteIndex(pathname, layout) {
  const route = pathname.startsWith('/product/') ? '/product/:id' : pathname
  const order = layout === 'admin' ? ADMIN_ROUTE_ORDER : SHOP_ROUTE_ORDER
  const index = order.indexOf(route)
  return index < 0 ? 0 : index
}

function getSlideDirection(fromPath, toPath, fromLayout, toLayout) {
  const destinationLayout = fromLayout === 'admin' && toLayout === 'shop' && toPath === '/'
    ? 'admin'
    : toLayout
  return getRouteIndex(toPath, destinationLayout) >= getRouteIndex(fromPath, fromLayout) ? 1 : -1
}

function AnimatedRouteOutlet() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const outlet = useOutlet()
  const layout = ADMIN_ROUTES.has(location.pathname) ? 'admin' : 'shop'
  const previousPathRef = React.useRef(location.pathname)
  const directionRef = React.useRef(1)
  const productTransitionRef = React.useRef(location.pathname.startsWith('/product/'))
  const reverseProductExitRef = React.useRef(false)
  const reverseCartPortalExitRef = React.useRef(false)

  if (previousPathRef.current !== location.pathname) {
    reverseProductExitRef.current = previousPathRef.current.startsWith('/product/') &&
      !location.pathname.startsWith('/product/') &&
      navigationType === 'POP'
    reverseCartPortalExitRef.current = previousPathRef.current === '/cart' &&
      location.pathname.startsWith('/product/') &&
      navigationType === 'POP'
    productTransitionRef.current = previousPathRef.current.startsWith('/product/') || location.pathname.startsWith('/product/')
    directionRef.current = getSlideDirection(previousPathRef.current, location.pathname, layout, layout)
    previousPathRef.current = location.pathname
  }
  const direction = directionRef.current
  const isProductTransition = productTransitionRef.current
  const transitionContext = {
    direction,
    preserveProductHero: reverseProductExitRef.current,
    preserveCartPortal: reverseCartPortalExitRef.current
  }

  return (
    <AnimatePresence
      mode={isProductTransition ? 'sync' : 'wait'}
      initial={false}
      custom={transitionContext}
      onExitComplete={() => {
        productTransitionRef.current = false
        reverseProductExitRef.current = false
        reverseCartPortalExitRef.current = false
      }}
    >
      <motion.div
        key={location.pathname}
        className="route-motion-frame"
        custom={transitionContext}
        variants={isProductTransition ? PRODUCT_ROUTE_VARIANTS : ROUTE_SLIDE_VARIANTS}
        initial="enter"
        animate="center"
        exit="exit"
        transition={isProductTransition
          ? { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}

function LayoutTransition() {
  const location = useLocation()
  const outlet = useOutlet()
  const layout = ADMIN_ROUTES.has(location.pathname) ? 'admin' : 'shop'
  const previousRouteRef = React.useRef({ pathname: location.pathname, layout })
  const directionRef = React.useRef(1)

  if (previousRouteRef.current.pathname !== location.pathname) {
    directionRef.current = getSlideDirection(
      previousRouteRef.current.pathname,
      location.pathname,
      previousRouteRef.current.layout,
      layout
    )
    previousRouteRef.current = { pathname: location.pathname, layout }
  }
  const direction = directionRef.current

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={layout}
        className="route-motion-frame"
        custom={direction}
        variants={ROUTE_SLIDE_VARIANTS}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}

// Customer-facing storefront: mobile-style shop with no admin chrome, just the bottom nav.
function ShopLayout() {
  useEffect(() => {
    let user = null
    try { user = JSON.parse(localStorage.getItem('winandchit_auth_user') || 'null') } catch (err) {}
    let guestId = ''
    try {
      guestId = localStorage.getItem('winandchit_guest_chat_id') || ''
      if (!guestId) {
        guestId = `guest_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
        localStorage.setItem('winandchit_guest_chat_id', guestId)
      }
    } catch (err) {}

    const userId = user?.id || user?._id || ''
    fetch('/api/chat/visitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: userId ? `user_${userId}` : guestId, isGuest: !userId, userId: userId || null, customerName: user?.name || '', customerPhone: user?.phone || '' })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let disposed = false
    const getConversationId = () => {
      let user = null
      try { user = JSON.parse(localStorage.getItem('winandchit_auth_user') || 'null') } catch (err) {}
      const userId = user?.id || user?._id || ''
      if (userId) return `user_${userId}`
      try { return localStorage.getItem('winandchit_guest_chat_id') || '' } catch (err) { return '' }
    }
    const register = requestPermission => registerPushNotifications(getConversationId(), requestPermission).catch(() => false)
    const onPushMessage = event => {
      const data = event.data || {}
      if (data.type === 'winandchit-push-open' && data.url) {
        window.location.assign(data.url)
        return
      }
      if (data.type !== 'winandchit-push') return
      playNotificationSound()
      triggerNotificationVibration([90, 55, 140])
      showDesktopNotification(data.payload?.title || 'Win & Chit', {
        body: data.payload?.body || 'You have a new update.',
        onClick: () => { if (data.payload?.url) window.location.assign(data.payload.url) }
      })
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onPushMessage)
    register(false)
    const requestOnInteraction = () => { if (!disposed) register(true) }
    window.addEventListener('pointerdown', requestOnInteraction, { once: true })
    return () => {
      disposed = true
      window.removeEventListener('pointerdown', requestOnInteraction)
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onPushMessage)
    }
  }, [])

  return (
    <div className="shop-app">
      <main className="shop-main-shell">
        <AnimatedRouteOutlet />
      </main>
      <BottomNav />
    </div>
  )
}

// Backend/staff area: keeps the existing top navbar with theme toggle.
function AdminLayout({ theme, toggleTheme }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [commentUnreadCount, setCommentUnreadCount] = useState(0)
  const lastUnreadRef = React.useRef(0)
  const pathPermission = {
    '/dashboard': 'dashboard',
    '/pos': 'pos',
    '/add-product': 'products',
    '/discounts': 'discounts',
    '/orders': 'orders',
    '/settings': 'settings',
    '/comments': 'comments'
  }
  const requiredPermission = pathPermission[location.pathname]
  const hasPermission = permission => Boolean(admin?.isOwner || admin?.permissions?.includes(permission))
  const allowedAdminRoutes = [
    ['/dashboard', 'dashboard'],
    ['/pos', 'pos'],
    ['/add-product', 'products'],
    ['/discounts', 'discounts'],
    ['/orders', 'orders'],
    ['/settings', 'settings'],
    ['/comments', 'comments']
  ]
  const firstAllowedRoute = allowedAdminRoutes.find(([, permission]) => hasPermission(permission))?.[0] || '/admin-login'

  useEffect(() => {
    let active = true
    if (!getAdminToken()) {
      setAdmin(null)
      setAuthLoading(false)
      return () => { active = false }
    }
    axios.get('/api/admin-auth/me')
      .then(response => {
        if (active) {
          setAdmin(response.data.admin)
          localStorage.setItem('winandchit_admin_user', JSON.stringify(response.data.admin))
        }
      })
      .catch(() => {
        clearAdminSession()
        if (active) setAdmin(null)
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })
    return () => { active = false }
  }, [])

  // Poll for unread customer messages and trigger desktop notification + audio chime when unread increases
  useEffect(() => {
    if (!admin || (!hasPermission('messages') && !hasPermission('comments'))) return undefined
    const fetchUnread = async () => {
      try {
        const [chatResponse, commentResponse] = await Promise.all([
          fetch('/api/chat/unread-count'),
          fetch('/api/product-comments/unread-count')
        ])
        const chatData = chatResponse.ok ? await chatResponse.json() : {}
        const commentData = commentResponse.ok ? await commentResponse.json() : {}
        const chatCount = Number(chatData.unreadCount || 0)
        const commentCount = Number(commentData.unreadCount || 0)
        const count = chatCount + commentCount
        if (count > lastUnreadRef.current) {
          playNotificationSound()
          triggerNotificationVibration([100, 60, 160])
          showDesktopNotification('New Customer Activity', {
            body: `You have ${count} unread customer message${count > 1 ? 's or product comments' : ' or product comment'}.`
          })
        }
        lastUnreadRef.current = count
        setUnreadCount(chatCount)
        setCommentUnreadCount(commentCount)
      } catch (e) {}
    }
    fetchUnread()
    const timer = setInterval(fetchUnread, 5000)
    return () => clearInterval(timer)
  }, [admin])

  if (location.pathname === '/admin-login') return null
  if (authLoading) {
    return <main className="page-wrapper" style={{ padding: 32 }}><p role="status">Checking admin session…</p></main>
  }
  if (!admin) {
    return <Navigate to="/admin-login" replace state={{ from: location.pathname }} />
  }
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to={firstAllowedRoute} replace state={{ noPermissions: firstAllowedRoute === '/admin-login' }} />
  }

  return (
    <>
      <header className="navbar-container">
        <div className="navbar">
          <NavLink to="/dashboard" className="nav-brand">
            <img src="/assets/winandchit-logo.png" alt="Win & Chit" className="brand-logo" />
            <div>
              <span className="brand-text">Win & Chit</span>
              <span className="brand-badge" style={{ marginLeft: 8 }}>POS</span>
            </div>
          </NavLink>

          <nav className="nav-links">
            {hasPermission('dashboard') && <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <BarChart3 size={16} strokeWidth={2.1} /> Dashboard
            </NavLink>}
            {hasPermission('pos') && <NavLink to="/pos" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <ShoppingCart size={16} strokeWidth={2.1} /> POS
            </NavLink>}
            {hasPermission('products') && <NavLink to="/add-product" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <PackagePlus size={16} strokeWidth={2.1} /> Add Product
            </NavLink>}
            {hasPermission('discounts') && <NavLink to="/discounts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <BadgePercent size={16} strokeWidth={2.1} /> Discounts
            </NavLink>}
            {hasPermission('orders') && <NavLink to="/orders" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <ClipboardList size={16} strokeWidth={2.1} /> Orders
            </NavLink>}
            {hasPermission('settings') && <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <SettingsIcon size={16} strokeWidth={2.1} /> Settings
            </NavLink>}
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
              <Store size={16} strokeWidth={2.1} /> View Shop
            </NavLink>

            {/* Admin Message Icon with Unread Count Badge */}
            {hasPermission('messages') && <button
              type="button"
              className="admin-msg-nav-btn"
              title="Customer Messages & Inquiries"
              aria-label="Customer Messages"
              onClick={() => {
                setChatOpen(true)
                setUnreadCount(0)
              }}
            >
              <MessageCircle size={18} strokeWidth={2.1} />
              {unreadCount > 0 && (
                <span className="admin-msg-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>}

            {hasPermission('comments') && <NavLink to="/comments" className="admin-msg-nav-btn" title="Product Comments & Questions" aria-label="Product Comments" onClick={() => setCommentUnreadCount(0)}>
              <MessagesSquare size={18} strokeWidth={2.1} />
              {commentUnreadCount > 0 && <span className="admin-msg-badge">{commentUnreadCount > 99 ? '99+' : commentUnreadCount}</span>}
            </NavLink>}

            <span className="nav-link" style={{ cursor: 'default' }}>{admin.username}</span>
            <button className="theme-toggle-btn" title="Sign out" aria-label="Sign out" onClick={() => {
              clearAdminSession()
              setAdmin(null)
              navigate('/admin-login', { replace: true })
            }}>
              <LogOut size={17} strokeWidth={2.1} />
            </button>

            <button className="theme-toggle-btn" title="Toggle theme" aria-label="Toggle theme" onClick={toggleTheme}>
              {theme === 'dark' ? <MoonStar size={17} strokeWidth={2.1} /> : <SunMedium size={17} strokeWidth={2.1} />}
            </button>
          </nav>
        </div>
      </header>

      <main>
        <AnimatedRouteOutlet />
      </main>

      <AdminChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  )
}

function App(){
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    } catch (e) {
      return 'light'
    }
  })

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light')
      localStorage.setItem('theme', theme)
    } catch (e) {}
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <MotionConfig reducedMotion="user">
      <CartProvider>
        <ChatHistoryProvider>
          <BrowserRouter>
            <GlobalTouchMist />
            <Routes>
              <Route element={<LayoutTransition />}>
                <Route path="/admin-login" element={<AdminLogin />} />
                {/* User Shop View: customer storefront */}
                <Route element={<ShopLayout />}>
                  <Route path="/" element={<Catalog/>} />
                  <Route path="/shop" element={<Catalog/>} />
                  <Route path="/product/:id" element={<ProductDetail/>} />
                  <Route path="/message" element={<Message/>} />
                  <Route path="/cart" element={<Cart/>} />
                  <Route path="/account" element={<Account/>} />
                </Route>

                {/* Admin Dashboard View: backend/staff operations */}
                <Route element={<AdminLayout theme={theme} toggleTheme={toggleTheme} />}>
                  <Route path="/dashboard" element={<AdminDashboard/>} />
                  <Route path="/comments" element={<AdminComments/>} />
                  <Route path="/pos" element={<POS/>} />
                  <Route path="/add-product" element={<AddProduct/>} />
                  <Route path="/orders" element={<Orders/>} />
                  <Route path="/settings" element={<ErrorBoundary><Settings/></ErrorBoundary>} />
                  <Route path="/discounts" element={<Discounts/>} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </ChatHistoryProvider>
      </CartProvider>
    </MotionConfig>
  )
}

createRoot(document.getElementById('root')).render(<App />)
