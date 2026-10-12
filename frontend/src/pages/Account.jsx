import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Phone, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, Settings as SettingsIcon, Sparkles, MapPin, User as UserIcon, X, Save, Package, Truck } from 'lucide-react'
import Banner from '../components/Banner'

// Rich vector illustration matching the exact luxury emerald/gold shopping elements (bag, hanger with top, sunglasses, high-heel pump)
function ShoppingIllustration() {
  return (
    <div className="account-illustration-wrap">
      <svg
        viewBox="0 0 340 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="account-illustration-svg"
      >
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fae084" />
            <stop offset="50%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#aa7c11" />
          </linearGradient>
          <linearGradient id="bagFrontGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#087042" />
            <stop offset="100%" stopColor="#034526" />
          </linearGradient>
          <linearGradient id="bagSideGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e5c158" />
            <stop offset="100%" stopColor="#b8860b" />
          </linearGradient>
          <linearGradient id="shirtGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0c824c" />
            <stop offset="100%" stopColor="#075e36" />
          </linearGradient>
          <linearGradient id="shirtGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5ea882" />
            <stop offset="100%" stopColor="#438a66" />
          </linearGradient>
          <linearGradient id="shoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#076d3f" />
            <stop offset="60%" stopColor="#044c2a" />
            <stop offset="100%" stopColor="#02301a" />
          </linearGradient>
          <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. SHOPPING BAG */}
        <g transform="translate(10, 15)">
          {/* Side Gold Panel */}
          <path
            d="M20 50 L42 46 L42 140 L20 134 Z"
            fill="url(#bagSideGrad)"
          />
          {/* Front Emerald Panel */}
          <path
            d="M42 46 L108 46 L108 140 L42 140 Z"
            fill="url(#bagFrontGrad)"
          />
          {/* Bag Fold line */}
          <path
            d="M31 48 L31 137"
            stroke="#946d0a"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
          {/* Handles */}
          <path
            d="M52 46 C52 14, 74 14, 74 46"
            stroke="url(#goldGrad)"
            strokeWidth="4.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M76 46 C76 14, 98 14, 98 46"
            stroke="url(#goldGrad)"
            strokeWidth="4.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* Circular Gold Logo Badge on Bag */}
          <circle cx="75" cy="93" r="22" fill="#04391f" stroke="url(#goldGrad)" strokeWidth="2.5" />
          <circle cx="75" cy="93" r="19" fill="none" stroke="url(#goldGrad)" strokeWidth="1" strokeDasharray="2 2" />
          <text
            x="75"
            y="92"
            textAnchor="middle"
            fill="url(#goldGrad)"
            fontSize="10"
            fontFamily="'Playfair Display', serif, Georgia"
            fontWeight="bold"
            fontStyle="italic"
          >
            W&amp;C
          </text>
          <text
            x="75"
            y="102"
            textAnchor="middle"
            fill="#fae084"
            fontSize="4.2"
            letterSpacing="0.8"
            fontWeight="700"
          >
            ONLINE SHOP
          </text>
        </g>

        {/* 2. HANGER & SHIRT */}
        <g transform="translate(118, 12)">
          {/* Gold Hanger Hook */}
          <path
            d="M48 24 C48 10, 36 10, 36 20 C36 26, 44 28, 44 38"
            stroke="url(#goldGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* Hanger Triangle */}
          <path
            d="M44 38 L6 62 C3 64, 4 68, 8 68 L80 68 C84 68, 85 64, 82 62 Z"
            fill="url(#goldGrad)"
          />
          {/* Shirt Body with two-tone blocks */}
          <path
            d="M16 66 L3 84 L14 92 L18 84 L18 142 L70 142 L70 84 L74 92 L85 84 L72 66 Z"
            fill="url(#shirtGrad1)"
            stroke="#044c2a"
            strokeWidth="1.5"
          />
          {/* Shirt color block accents */}
          <path
            d="M44 66 L72 66 L70 142 L44 142 Z"
            fill="url(#shirtGrad2)"
          />
          <path
            d="M18 114 L44 114 L44 142 L18 142 Z"
            fill="#72b894"
          />
          {/* Gold Shirt Collar */}
          <path
            d="M32 66 L44 80 L56 66 L44 72 Z"
            fill="url(#goldGrad)"
          />
        </g>

        {/* 3. SUNGLASSES */}
        <g transform="translate(196, 36)">
          {/* Left Lens */}
          <rect x="0" y="8" width="28" height="18" rx="5" fill="#064f2c" stroke="url(#goldGrad)" strokeWidth="3" />
          {/* Right Lens */}
          <rect x="36" y="8" width="28" height="18" rx="5" fill="#064f2c" stroke="url(#goldGrad)" strokeWidth="3" />
          {/* Bridge */}
          <path d="M28 14 C31 11, 33 11, 36 14" stroke="url(#goldGrad)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          {/* Browline bar */}
          <path d="M-2 9 L66 9" stroke="url(#goldGrad)" strokeWidth="2.5" strokeLinecap="round" />
          {/* Lens glare */}
          <path d="M4 12 L12 22" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
          <path d="M40 12 L48 22" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* 4. HIGH HEEL PUMP SHOE */}
        <g transform="translate(186, 68)">
          {/* Gold Insole & Collar Trim */}
          <path
            d="M26 48 C42 46, 60 28, 80 8 C84 4, 90 20, 84 38 C76 56, 45 74, 15 74 Z"
            fill="url(#goldGrad)"
          />
          {/* Emerald Shoe Outer */}
          <path
            d="M2 74 C18 74, 46 64, 72 38 C78 30, 86 6, 88 4 C90 12, 88 34, 80 50 C70 68, 48 76, 20 76 L2 76 Z"
            fill="url(#shoeGrad)"
            stroke="url(#goldGrad)"
            strokeWidth="1"
          />
          {/* Gold Stiletto Heel */}
          <path
            d="M74 48 L70 82 L76 82 L81 48 Z"
            fill="url(#goldGrad)"
          />
          {/* Gold Pointed Toe Cap & Strap */}
          <path
            d="M2 74 L18 68 L24 76 L2 76 Z"
            fill="url(#goldGrad)"
          />
          <path
            d="M32 64 L36 76"
            stroke="url(#goldGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  )
}

function resolveMembership(user) {
  return user?.membership || 'Standard'
}

function normalizeUser(user) {
  const normalized = { ...user }
  delete normalized.membershipTier
  return { ...normalized, membership: resolveMembership(normalized) }
}

const USER_PROFILE_UPDATE_KEY = 'winandchit_user_profile_updated'

export default function Account() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState(() => {
    const requestedMode = new URLSearchParams(location.search).get('mode')
    return requestedMode === 'login' || requestedMode === 'signup' ? requestedMode : 'welcome'
  }) // 'welcome' | 'login' | 'signup' | 'loggedin'
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileFormData, setProfileFormData] = useState({
    name: '',
    address: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [profileSaveLoading, setProfileSaveLoading] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState('')
  const [profileSaveSuccess, setProfileSaveSuccess] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showOrderHistory, setShowOrderHistory] = useState(false)
  const [accountOrders, setAccountOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('winandchit_auth_user')
      if (!saved) return null
      const user = normalizeUser(JSON.parse(saved))
      localStorage.setItem('winandchit_auth_user', JSON.stringify(user))
      return user
    } catch {
      return null
    }
  })

  // Validate active session against MongoDB
  useEffect(() => {
    if (!currentUser?._id && !currentUser?.phone) return

    let canceled = false
    async function verifyUserStatus() {
      try {
        const res = await axios.get('/api/users')
        if (canceled || !Array.isArray(res.data)) return
        const found = res.data.find(u => (currentUser._id && u._id === currentUser._id) || u.phone === currentUser.phone)
        if (found) {
          if (found.isBlocked) {
            // Blocked by admin -> log out immediately
            handleLogout()
            alert('Your account has been blocked by the administrator.')
            return
          }
          // If password, name, phone or address changed on server side, check credentials
          if (currentUser.password && found.password !== currentUser.password) {
            handleLogout()
            alert('Your account details were updated by admin. Please log in with your updated credentials.')
            return
          }
          // Update local session with latest verified data
          const updatedUser = {
            ...currentUser,
            name: found.name,
            phone: found.phone,
            address: found.address,
            membership: resolveMembership(found),
            isBlocked: found.isBlocked,
            password: found.password
          }
          localStorage.setItem('winandchit_auth_user', JSON.stringify(updatedUser))
          setCurrentUser(updatedUser)
        }
      } catch (err) {
        // keep local state if network fails
      }
    }

    verifyUserStatus()
    return () => { canceled = true }
  }, [currentUser?._id, currentUser?.phone])

  useEffect(() => {
    const userId = currentUser?._id || currentUser?.id
    if (!userId) return undefined

    let canceled = false
    let requestRevision = 0
    const applyProfile = profile => {
      if (profile.isBlocked) {
        handleLogout()
        alert('Your account has been blocked by the administrator.')
        return
      }
      setCurrentUser(current => {
        if (!current) return current
        const updatedUser = {
          ...current,
          name: profile.name ?? current.name,
          phone: profile.phone ?? current.phone,
          address: profile.address ?? current.address,
          membership: resolveMembership(profile),
          role: profile.role ?? current.role,
          isBlocked: false
        }
        localStorage.setItem('winandchit_auth_user', JSON.stringify(updatedUser))
        return updatedUser
      })
    }
    const applyCachedUser = cachedUser => {
      const activeId = String(userId)
      const cachedId = String(cachedUser?._id || cachedUser?.id || '')
      if ((cachedId && cachedId !== activeId) || (!cachedId && cachedUser?.phone !== currentUser.phone)) return
      setCurrentUser(current => {
        if (!current) return current
        const updatedUser = { ...current, ...normalizeUser(cachedUser) }
        localStorage.setItem('winandchit_auth_user', JSON.stringify(updatedUser))
        return updatedUser
      })
    }
    const syncProfile = async () => {
      if (canceled) return
      const revision = ++requestRevision
      try {
        let response
        try {
          response = await axios.get(`/api/users/${encodeURIComponent(userId)}/profile`)
        } catch (error) {
          if (!currentUser.phone) throw error
          const usersResponse = await axios.get('/api/users')
          if (!Array.isArray(usersResponse.data)) throw error
          const found = usersResponse.data.find(user =>
            String(user?._id || user?.id || '') === String(userId)
            || user?.phone === currentUser.phone
          )
          if (!found) throw error
          response = { data: found }
        }
        if (canceled || revision !== requestRevision) return
        const profile = response.data
        applyProfile(profile)
      } catch (error) {
        if (!canceled && revision === requestRevision) console.error('Failed to sync customer profile:', error)
      }
    }

    const onProfileUpdated = event => {
      const update = event.detail
      const updatedUserId = String(update?.userId || '')
      if (updatedUserId && updatedUserId !== String(userId) && update?.phone !== currentUser.phone) return
      requestRevision += 1
      if (update?.membership) {
        setCurrentUser(current => {
          if (!current || (
            String(current._id || current.id || '') !== String(userId)
            && current.phone !== update.phone
          )) return current
          const updated = {
            ...current,
            membership: update.membership
          }
          localStorage.setItem('winandchit_auth_user', JSON.stringify(updated))
          return updated
        })
      }
      syncProfile()
    }
    const onStorage = event => {
      if (event.key === 'winandchit_auth_user') {
        if (!event.newValue) {
          handleLogout()
          return
        }
        try {
          const session = JSON.parse(event.newValue)
          const sessionId = String(session?._id || session?.id || '')
          if (sessionId === String(userId) || session?.phone === currentUser.phone) {
            applyCachedUser(session)
            requestRevision += 1
            syncProfile()
          }
        } catch (error) {
          console.error('Failed to read updated customer session:', error)
        }
      }
      if (event.key === 'winandchit_users' && event.newValue) {
        try {
          const users = JSON.parse(event.newValue)
          if (!Array.isArray(users)) return
          const found = users.find(user =>
            String(user?._id || user?.id || '') === String(userId)
            || user?.phone === currentUser.phone
          )
          if (found) applyCachedUser(found)
          requestRevision += 1
          syncProfile()
        } catch (error) {
          console.error('Failed to read the updated users list:', error)
        }
      }
      if (event.key === USER_PROFILE_UPDATE_KEY && event.newValue) {
        try {
          const update = JSON.parse(event.newValue)
          if (String(update.userId) === String(userId) || update.phone === currentUser.phone) {
            requestRevision += 1
            if (update.membership) {
              setCurrentUser(current => {
                if (!current || (String(current._id || current.id || '') !== String(userId) && current.phone !== update.phone)) return current
                const updated = { ...current, membership: update.membership }
                localStorage.setItem('winandchit_auth_user', JSON.stringify(updated))
                return updated
              })
            }
            syncProfile()
          }
        } catch (error) {
          console.error('Failed to read cross-tab user profile update:', error)
        }
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncProfile()
    }

    syncProfile()
    const interval = window.setInterval(syncProfile, 5000)
    window.addEventListener('user-profile-updated', onProfileUpdated)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      canceled = true
      window.clearInterval(interval)
      window.removeEventListener('user-profile-updated', onProfileUpdated)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [currentUser?._id, currentUser?.id])

  useEffect(() => {
    const userId = currentUser?.id || currentUser?._id
    if (!userId) return
    let cancelled = false
    async function loadOrders() {
      setOrdersLoading(true)
      setOrdersError('')
      try {
        const response = await axios.get(`/api/sales/customer/${userId}`)
        if (!cancelled) setAccountOrders(Array.isArray(response.data) ? response.data : [])
      } catch (err) {
        if (!cancelled) setOrdersError('Your orders could not be loaded right now.')
      } finally {
        if (!cancelled) setOrdersLoading(false)
      }
    }
    loadOrders()
    return () => { cancelled = true }
  }, [currentUser?.id, currentUser?._id])

  const formatOrderTime = (value) => value ? new Date(value).toLocaleString() : 'Waiting for update'
  const getOrderTimeline = (order) => [
    { label: 'Order placed', time: order.orderPlacedAt || order.date },
    { label: 'Confirmed', time: order.confirmedAt },
    { label: 'Packed', time: order.packedAt },
    { label: 'Shipped', time: order.shippedAt },
    { label: 'Delivered', time: order.deliveredAt }
  ]

  // Helper validation functions
  const isValidPhoneNumber = (str) => /^[0-9]+$/.test(str)
  const isValidPassword = (str) => /^[a-zA-Z0-9]+$/.test(str)

  async function migrateGuestCheckout(user) {
    try {
      const guestConversationId = localStorage.getItem('winandchit_guest_chat_id')
      const userId = user?.id || user?._id
      if (!guestConversationId || !userId) return
      await axios.post('/api/chat/migrate-guest', {
        guestConversationId,
        userId,
        customerName: user.name,
        customerPhone: user.phone
      })
      localStorage.removeItem('winandchit_guest_chat_id')
    } catch (err) {
      console.warn('Guest checkout migration will be retried on a future sign-in:', err)
    }
  }

  async function handleLoginSubmit(e) {
    if (e) e.preventDefault()
    const cleanPhone = phone.trim()
    const cleanPassword = password.trim()

    if (!cleanPhone) {
      setError('Please enter your phone number')
      return
    }

    // Strict Phone Number Validation: numeric digits only (0-9)
    if (!isValidPhoneNumber(cleanPhone)) {
      setError('Phone number must contain only numeric digits (0-9). Letters or symbols are not allowed.')
      return
    }

    if (!cleanPassword) {
      setError('Please enter your password')
      return
    }

    // Strict Password Validation: minimum 6 characters
    if (cleanPassword.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    // Strict Password Validation: alphanumeric only (English letters & digits)
    if (!isValidPassword(cleanPassword)) {
      setError('Password must contain only English letters and numbers (no special or Burmese characters).')
      return
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Please enter your full name')
        return
      }
      if (!address.trim()) {
        setError('Please enter your full address')
        return
      }
    }

    setError('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        // Save new user directly to MongoDB database
        const res = await axios.post('/api/users/register', {
          name: name.trim(),
          phone: cleanPhone,
          address: address.trim(),
          password: cleanPassword
        })
        const user = normalizeUser(res.data)

        // Store authenticated session
        localStorage.setItem('winandchit_auth_user', JSON.stringify(user))

        // Also sync local cache for instant admin synchronization
        try {
          const raw = localStorage.getItem('winandchit_users')
          const list = raw ? JSON.parse(raw).map(normalizeUser) : []
          const existsIdx = list.findIndex(u => u._id === user._id || u.phone === user.phone)
          if (existsIdx >= 0) list[existsIdx] = user
          else list.unshift(user)
          localStorage.setItem('winandchit_users', JSON.stringify(list))
        } catch {}

        await migrateGuestCheckout(user)
        setCurrentUser(user)
        setMode('loggedin')
        if (location.state?.returnTo) navigate(location.state.returnTo, { replace: true })
      } else {
        // Sign In via backend MongoDB
        const res = await axios.post('/api/users/login', {
          phone: cleanPhone,
          password: cleanPassword
        })
        const user = normalizeUser(res.data)
        localStorage.setItem('winandchit_auth_user', JSON.stringify(user))
        await migrateGuestCheckout(user)
        setCurrentUser(user)
        setMode('loggedin')
        if (location.state?.returnTo) navigate(location.state.returnTo, { replace: true })
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Authentication failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    try {
      localStorage.removeItem('winandchit_auth_user')
    } catch {}
    setCurrentUser(null)
    setPhone('')
    setPassword('')
    setName('')
    setAddress('')
    setIsEditingProfile(false)
    setMode('welcome')
  }

  function startEditProfile() {
    setProfileFormData({
      name: currentUser?.name || '',
      address: currentUser?.address || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
    setProfileSaveError('')
    setProfileSaveSuccess('')
    setIsEditingProfile(true)
  }

  function cancelEditProfile() {
    setIsEditingProfile(false)
    setProfileSaveError('')
    setProfileSaveSuccess('')
  }

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileSaveError('')
    setProfileSaveSuccess('')

    if (!profileFormData.name.trim()) {
      setProfileSaveError('Full name cannot be empty')
      return
    }

    // If changing password, current password must be provided
    const wantNewPassword = Boolean(profileFormData.newPassword && profileFormData.newPassword.trim())
    if (wantNewPassword) {
      if (!profileFormData.currentPassword || !profileFormData.currentPassword.trim()) {
        setProfileSaveError('Please enter your current password to set a new password')
        return
      }
      if (profileFormData.newPassword.trim() !== profileFormData.confirmPassword.trim()) {
        setProfileSaveError('New password and confirm password do not match')
        return
      }
      if (profileFormData.newPassword.trim().length < 6) {
        setProfileSaveError('New password must be at least 6 characters long')
        return
      }
      if (!isValidPassword(profileFormData.newPassword.trim())) {
        setProfileSaveError('Password must contain only English letters and numbers (no special or Burmese characters).')
        return
      }
    }

    setProfileSaveLoading(true)
    try {
      const payload = {
        name: profileFormData.name.trim(),
        address: profileFormData.address.trim()
      }

      if (wantNewPassword) {
        payload.currentPassword = profileFormData.currentPassword.trim()
        payload.password = profileFormData.newPassword.trim()
      }

      let updatedUser
      if (currentUser?._id) {
        const res = await axios.put(`/api/users/${currentUser._id}`, payload)
        updatedUser = res.data
      } else {
        // Fallback for non-persisted user
        updatedUser = {
          ...currentUser,
          name: payload.name,
          address: payload.address,
          password: payload.password || currentUser.password
        }
      }

      // Update local storage and current user state
      localStorage.setItem('winandchit_auth_user', JSON.stringify(updatedUser))
      setCurrentUser(updatedUser)

      // Also update winandchit_users list if present
      try {
        const raw = localStorage.getItem('winandchit_users')
        const cachedUsers = raw ? JSON.parse(raw) : []
        const list = Array.isArray(cachedUsers) ? cachedUsers.map(normalizeUser) : []
        const idx = list.findIndex(u => (u._id && u._id === updatedUser._id) || u.phone === updatedUser.phone)
        if (idx !== -1) {
          list[idx] = updatedUser
          localStorage.setItem('winandchit_users', JSON.stringify(list))
        }
      } catch {}

      setProfileSaveSuccess('Profile updated successfully!')
      setTimeout(() => {
        setIsEditingProfile(false)
        setProfileSaveSuccess('')
      }, 900)
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to update profile'
      setProfileSaveError(msg)
    } finally {
      setProfileSaveLoading(false)
    }
  }

  // If already logged in, show personalized VIP account dashboard
  if (currentUser || mode === 'loggedin') {
    return (
      <div className="account-container loggedin-view">
        <div className="account-bg-glows" />
        
        {/* Top Section Banner */}
        <div className="account-top-banner-wrap">
          <Banner className="account-banner" />
        </div>

        {/* Profile Details Card Panel */}
        <div className="account-card-panel">
          {/* Top-Right Settings / Edit Icon Button */}
          <button
            type="button"
            className="account-settings-btn"
            onClick={startEditProfile}
            title="Edit Profile Settings"
            aria-label="Edit Profile Settings"
          >
            <SettingsIcon size={18} />
          </button>

          <div className="account-user-header">
            <div className="account-avatar-wrap">
              <img src="/assets/winandchit-logo.png" alt="Win & Chit" className="account-avatar-img" />
              <div className="account-avatar-badge">
                <Sparkles size={12} />
              </div>
            </div>
            <h2>{currentUser?.name || 'VIP Member'}</h2>
            <p className="account-user-phone">{currentUser?.phone || '+95 9 123 456 789'}</p>
            {currentUser?.address && (
              <p style={{ fontSize: '0.78rem', color: '#8bbba1', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <MapPin size={13} /> {currentUser.address}
              </p>
            )}
            <span className="account-vip-badge">{resolveMembership(currentUser)} Member • Win &amp; Chit</span>
          </div>

          <div className="account-menu-list">
            <button type="button" className="account-menu-item" onClick={() => { setShowOrderHistory(value => !value); setSelectedOrder(null) }}>
              <span>My Orders &amp; Bag</span>
              <span className="account-menu-arrow">›</span>
            </button>
            {currentUser?.role && String(currentUser.role).toLowerCase() === 'admin' && (
              <Link to="/dashboard" className="account-menu-item">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <SettingsIcon size={14} /> Staff / Admin Portal
                </span>
                <span className="account-menu-arrow">›</span>
              </Link>
            )}
          </div>

          {showOrderHistory && (
            <section className="account-orders-panel" aria-label="Order history">
              <div className="account-orders-heading"><strong>My Orders</strong><span>{accountOrders.length}</span></div>
              {ordersLoading && <p className="account-orders-note">Loading your orders...</p>}
              {ordersError && <p className="account-orders-note account-orders-error">{ordersError}</p>}
              {!ordersLoading && !ordersError && accountOrders.length === 0 && <p className="account-orders-note">Your completed checkout orders will appear here.</p>}
              {accountOrders.map(order => (
                <button key={order._id} type="button" className="account-order-row" onClick={() => setSelectedOrder(order)}>
                  <span className="account-order-icon"><Package size={16} /></span>
                  <span><strong>{order.receiptNumber || 'Order'}</strong><small>{new Date(order.date).toLocaleDateString()} · {order.total?.toLocaleString()} Ks</small></span>
                  <span className={`badge ${order.status === 'delivered' ? 'badge-success' : order.status === 'cancelled' ? 'badge-danger' : 'badge-primary'}`}>{order.status || 'pending'}</span>
                </button>
              ))}
              {selectedOrder && (
                <div className="account-order-detail">
                  <div className="account-order-detail-head"><div><strong>{selectedOrder.receiptNumber}</strong><small>{selectedOrder.customer?.deliveryStation || 'Delivery service pending'}</small></div><button type="button" onClick={() => setSelectedOrder(null)} aria-label="Close order details"><X size={16} /></button></div>
                  <div className="account-order-items">{selectedOrder.items?.map((item, index) => <div key={`${item.sku}-${index}`}><span>{item.title} × {item.qty}</span><strong>{item.subtotal?.toLocaleString()} Ks</strong></div>)}</div>
                  <div className="account-order-timeline">{getOrderTimeline(selectedOrder).map((event, index) => <div key={event.label} className={event.time ? 'complete' : ''}><span>{event.time ? <CheckCircle2 size={14} /> : <Truck size={14} />}</span><p><strong>{event.label}</strong><small>{formatOrderTime(event.time)}</small></p>{index < 4 && <i />}</div>)}</div>
                </div>
              )}
            </section>
          )}

          <button type="button" className="btn btn-secondary account-logout-btn" onClick={handleLogout}>
            Sign Out
          </button>
        </div>

        {/* Bottom Section Graphic Illustration */}
        <div className="account-bottom-illustration-wrap">
          <ShoppingIllustration />
        </div>

        {/* Edit Profile Modal Dialog */}
        <AnimatePresence>
          {isEditingProfile && (
            <motion.div
              className="account-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={cancelEditProfile}
            >
              <motion.div
                className="account-modal-card"
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                onClick={e => e.stopPropagation()}
              >
                <div className="account-modal-header">
                  <h3 className="account-modal-title">
                    <SettingsIcon size={18} /> Edit Profile Settings
                  </h3>
                  <button
                    type="button"
                    className="account-modal-close"
                    onClick={cancelEditProfile}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="account-modal-body">
                  {profileSaveError && (
                    <div className="account-form-alert error">
                      {profileSaveError}
                    </div>
                  )}

                  {profileSaveSuccess && (
                    <div className="account-form-alert success">
                      {profileSaveSuccess}
                    </div>
                  )}

                  <form id="edit-profile-form" onSubmit={handleProfileSave} className="account-profile-form">
                    {/* Read-only Phone Number */}
                    <div className="account-modal-field-group">
                      <label className="account-modal-label">
                        <span className="account-modal-label-text">
                          <Phone size={14} /> Phone Number (Primary ID)
                        </span>
                        <span className="account-modal-readonly-tag">Strictly Read-Only</span>
                      </label>
                      <input
                        className="account-modal-input readonly"
                        value={currentUser?.phone || ''}
                        disabled
                        readOnly
                      />
                    </div>

                    {/* Full Name */}
                    <div className="account-modal-field-group">
                      <label className="account-modal-label">
                        <span className="account-modal-label-text">
                          <UserIcon size={14} /> Full Name <span className="req-star">*</span>
                        </span>
                      </label>
                      <input
                        className="account-modal-input"
                        placeholder="Enter full name"
                        value={profileFormData.name}
                        onChange={e => setProfileFormData({ ...profileFormData, name: e.target.value })}
                        required
                      />
                    </div>

                    {/* Delivery Address */}
                    <div className="account-modal-field-group">
                      <label className="account-modal-label">
                        <span className="account-modal-label-text">
                          <MapPin size={14} /> Full Delivery Address
                        </span>
                      </label>
                      <textarea
                        className="account-modal-input account-modal-textarea"
                        placeholder="House no, street, township, city..."
                        value={profileFormData.address}
                        onChange={e => setProfileFormData({ ...profileFormData, address: e.target.value })}
                        rows={3}
                      />
                    </div>

                    {/* Password Change Section */}
                    <div className="account-modal-pw-section">
                      <div className="account-modal-pw-header">
                        <Lock size={15} />
                        <h4>Change Password (စကားဝှက် ပြောင်းလဲရန်)</h4>
                      </div>
                      <p className="account-modal-pw-hint">
                        Leave blank if you do not want to change your password.
                      </p>

                      {/* Current Password Verification */}
                      <div className="account-modal-field-group">
                        <label className="account-modal-label">
                          <span className="account-modal-label-text">
                            Current Password (လက်ရှိစကားဝှက်)
                          </span>
                        </label>
                        <div className="account-modal-pw-input-wrap">
                          <input
                            className="account-modal-input with-toggle"
                            type={showCurrentPassword ? 'text' : 'password'}
                            placeholder="Enter current password to verify"
                            value={profileFormData.currentPassword}
                            onChange={e => setProfileFormData({ ...profileFormData, currentPassword: e.target.value })}
                          />
                          <button
                            type="button"
                            className="account-modal-pw-toggle"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            aria-label="Toggle Current Password Visibility"
                          >
                            {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* New Password */}
                      <div className="account-modal-field-group">
                        <label className="account-modal-label">
                          <span className="account-modal-label-text">
                            New Password (စကားဝှက်အသစ် - အနည်းဆုံး ၆ လုံး)
                          </span>
                        </label>
                        <div className="account-modal-pw-input-wrap">
                          <input
                            className="account-modal-input with-toggle"
                            type={showNewPassword ? 'text' : 'password'}
                            placeholder="Enter new password (min 6 letters/digits)"
                            value={profileFormData.newPassword}
                            onChange={e => {
                              const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                              setProfileFormData({ ...profileFormData, newPassword: val })
                            }}
                          />
                          <button
                            type="button"
                            className="account-modal-pw-toggle"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            aria-label="Toggle New Password Visibility"
                          >
                            {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* Confirm New Password */}
                      <div className="account-modal-field-group" style={{ marginBottom: 4 }}>
                        <label className="account-modal-label">
                          <span className="account-modal-label-text">
                            Confirm New Password (စကားဝှက်အသစ် ပြန်ရိုက်ပါ)
                          </span>
                        </label>
                        <input
                          className="account-modal-input"
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder="Re-type new password"
                          value={profileFormData.confirmPassword}
                          onChange={e => {
                            const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                            setProfileFormData({ ...profileFormData, confirmPassword: val })
                          }}
                        />
                      </div>
                    </div>

                    {/* Integrated illustration inside modal with clean spacing */}
                    <div className="account-modal-illustration-wrap">
                      <ShoppingIllustration />
                    </div>
                  </form>
                </div>

                {/* Fixed Clean Footer Buttons */}
                <div className="account-modal-footer">
                  <button
                    type="submit"
                    form="edit-profile-form"
                    className="btn btn-primary account-modal-save-btn"
                    disabled={profileSaveLoading}
                  >
                    {profileSaveLoading ? 'Saving...' : <><Save size={15} /> Save Changes</>}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary account-modal-cancel-btn"
                    onClick={cancelEditProfile}
                    disabled={profileSaveLoading}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="account-screen">
      {/* Dark luxury emerald ambient glow effects */}
      <div className="account-bg-glows">
        <div className="glow-orb glow-orb-top" />
        <div className="glow-orb glow-orb-middle" />
        <div className="glow-orb glow-orb-bottom" />
      </div>

      <div className="account-content-wrap">
        {/* Floating back navigation button when in login / signup mode (positioned absolutely so header is untouched) */}
        {mode !== 'welcome' && (
          <motion.button
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            type="button"
            className="account-back-btn"
            onClick={() => {
              setError('')
              setMode('welcome')
            }}
            aria-label="Back to welcome screen"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </motion.button>
        )}

        {/* 1. TOP LOGO & HEADER (Completely static, fixed, and immovable) */}
        <div className="account-header-box">
          <div className="account-logo-frame">
            <img
              src="/assets/winandchit-logo.png"
              alt="Win & Chit Online Shop"
              className="account-logo-img"
            />
          </div>

          <h1 className="account-title">Welcome to Win & Chit</h1>
          <p className="account-subtitle">Your fashion destination</p>

          <Banner className="account-banner" />
        </div>

        {/* 2. CENTER AREA: FORM & SHOPPING ICONS */}
        <div className="account-center-stage">
          <AnimatePresence>
            {mode !== 'welcome' && (
              <motion.form
                key="account-form-panel"
                onSubmit={handleLoginSubmit}
                initial={{ opacity: 0, y: -16, height: 0 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  height: 'auto',
                  transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] }
                }}
                exit={{
                  opacity: 0,
                  y: -12,
                  height: 0,
                  transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
                }}
                className="account-form-panel"
              >
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="account-error-banner"
                  >
                    {error}
                  </motion.div>
                )}

                {mode === 'signup' && (
                  <>
                    <div className="account-input-group">
                      <label className="account-input-label">Full Name</label>
                      <div className="account-input-field-wrap">
                        <span className="account-input-icon">
                          <UserIcon size={17} />
                        </span>
                        <input
                          type="text"
                          placeholder="Enter your name"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          className="account-text-input with-icon"
                          autoComplete="name"
                        />
                      </div>
                    </div>

                    <div className="account-input-group">
                      <label className="account-input-label">Full Address (လိပ်စာအပြည့်အစုံ)</label>
                      <div className="account-input-field-wrap">
                        <span className="account-input-icon">
                          <MapPin size={17} />
                        </span>
                        <input
                          type="text"
                          placeholder="e.g., No. 12, Main Road, Yangon"
                          value={address}
                          onChange={e => setAddress(e.target.value)}
                          className="account-text-input with-icon"
                          autoComplete="street-address"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="account-input-group">
                  <label className="account-input-label">Phone Number (နံပါတ်သီးသန့်)</label>
                  <div className="account-input-field-wrap">
                    <span className="account-input-icon">
                      <Phone size={17} />
                    </span>
                    <input
                      type="tel"
                      placeholder="09..."
                      value={phone}
                      onChange={e => {
                        // Allow only numeric digits (0-9)
                        const val = e.target.value.replace(/[^0-9]/g, '')
                        setPhone(val)
                      }}
                      className="account-text-input with-icon"
                      autoComplete="tel"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="account-input-group">
                  <label className="account-input-label">Password (အနည်းဆုံး ၆ လုံး)</label>
                  <div className="account-input-field-wrap">
                    <span className="account-input-icon">
                      <Lock size={17} />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 6 characters (letters/numbers)"
                      value={password}
                      onChange={e => {
                        // Allow only English alphanumeric characters (a-zA-Z0-9)
                        const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                        setPassword(val)
                      }}
                      className="account-text-input with-icon with-action"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="account-input-toggle-btn"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {mode === 'login' && (
                  <div className="account-forgot-row">
                    <button
                      type="button"
                      className="account-forgot-link"
                      onClick={() => alert('Please contact shop support or Admin to reset your password.')}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </motion.form>
            )}
          </AnimatePresence>

          {/* Shopping icons: retains exact original size and smoothly moves down into space above buttons */}
          <motion.div
            layout
            transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
            className="account-illustration-container"
          >
            <ShoppingIllustration />
          </motion.div>
        </div>

        {/* 3. BOTTOM ACTION BUTTONS */}
        <div className="account-bottom-actions">
          {/* Main Action Button (LOGIN -> SIGN IN) */}
          <motion.button
            layout
            type={mode === 'welcome' ? 'button' : 'submit'}
            onClick={mode === 'welcome' ? () => { setError(''); setMode('login') } : handleLoginSubmit}
            disabled={loading}
            className="account-btn account-btn-login"
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
          >
            {loading ? (
              <span className="account-btn-loading-text">Processing...</span>
            ) : mode === 'welcome' ? (
              'LOGIN'
            ) : mode === 'signup' ? (
              'CREATE ACCOUNT'
            ) : (
              'SIGN IN'
            )}
          </motion.button>

          {/* SIGN UP Button transitions into the footer link in login/signup mode */}
          <AnimatePresence mode="wait">
            {mode === 'welcome' ? (
              <motion.button
                key="signup-btn"
                type="button"
                onClick={() => {
                  setError('')
                  setMode('signup')
                }}
                className="account-btn account-btn-signup"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, height: 52 }}
                exit={{
                  opacity: 0,
                  scale: 0.8,
                  height: 0,
                  marginTop: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                  borderWidth: 0,
                  transition: { duration: 0.2, ease: 'easeInOut' }
                }}
                whileTap={{ scale: 0.97 }}
              >
                SIGN UP
              </motion.button>
            ) : (
              <motion.div
                key="switch-mode-row"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.22, delay: 0.08 }}
                className="account-switch-mode-row"
              >
                {mode === 'login' ? (
                  <>
                    <span>Don't have an account?</span>{' '}
                    <button
                      type="button"
                      className="account-inline-link"
                      onClick={() => {
                        setError('')
                        setMode('signup')
                      }}
                    >
                      Sign Up
                    </button>
                  </>
                ) : (
                  <>
                    <span>Already have an account?</span>{' '}
                    <button
                      type="button"
                      className="account-inline-link"
                      onClick={() => {
                        setError('')
                        setMode('login')
                      }}
                    >
                      Login
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
