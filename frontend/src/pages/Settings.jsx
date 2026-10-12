import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { AnimatePresence, motion } from 'framer-motion'
import { Settings2, Building2, CreditCard, Tags, Truck, Users, Save, Eye, Lightbulb, Plus, PencilLine, X, Zap, Upload, Trash2, FolderOpen, Sparkles, Shirt, Droplets, Palette, Footprints, Coffee, Puzzle, SwatchBook, PackagePlus, ShieldAlert, CheckCircle, Search, Lock, MapPin, Phone, Download, User as UserIcon, Shield } from 'lucide-react'
import AdminManagement from '../components/AdminManagement'
import { getStoredAdmin } from '../utils/adminAuth'

const SETTINGS_TAB_ORDER = ['information', 'banks', 'categories', 'delivery', 'users', 'admins']
const USER_PROFILE_UPDATE_KEY = 'winandchit_user_profile_updated'

function resolveUserMembership(user) {
  return user?.membership || 'Standard'
}

function normalizeUser(user) {
  const normalized = { ...user }
  delete normalized.membershipTier
  return { ...normalized, membership: resolveUserMembership(normalized) }
}

function notifyUserProfileUpdated(user) {
  const userId = String(user?._id || user?.id || '')
  if (!userId) return
  const membership = resolveUserMembership(user)

  try {
    localStorage.setItem(USER_PROFILE_UPDATE_KEY, JSON.stringify({
      userId,
      phone: user.phone,
      membership,
      updatedAt: Date.now()
    }))
  } catch (error) {
    console.error('Failed to notify other tabs about the user profile update:', error)
  }
  window.dispatchEvent(new CustomEvent('user-profile-updated', {
    detail: {
      userId,
      phone: user.phone,
      membership
    }
  }))
}

function findUserRecordIndex(records, user, fallbackPhones = []) {
  const userId = user?._id || user?.id
  if (userId) {
    const idIndex = records.findIndex(record => {
      const recordId = record?._id || record?.id
      return recordId && String(recordId) === String(userId)
    })
    if (idIndex !== -1) return idIndex
  }

  const phones = new Set([user?.phone, ...fallbackPhones].filter(Boolean).map(String))
  return records.findIndex(record => phones.has(String(record?.phone || '')))
}

function replaceUserRecord(records, user, fallbackPhones = []) {
  const normalizedRecords = records.map(normalizeUser)
  const normalizedUser = normalizeUser(user)
  const index = findUserRecordIndex(normalizedRecords, normalizedUser, fallbackPhones)
  if (index === -1) return [normalizedUser, ...normalizedRecords]
  return normalizedRecords.map((record, recordIndex) =>
    recordIndex === index ? { ...record, ...normalizedUser } : record
  )
}

function filterUsersBySearch(users, search) {
  const query = search.trim().toLowerCase()
  if (!query) return users
  return users.filter(user =>
    (user.name || '').toLowerCase().includes(query)
    || (user.phone || '').includes(query)
    || (user.address || '').toLowerCase().includes(query)
    || resolveUserMembership(user).toLowerCase().includes(query)
  )
}

function alertImageCleanup(response) {
  const failures = Number(response?.data?.imageCleanupFailures || 0)
  if (failures > 0) alert(`${failures} hosted image(s) could not be deleted from storage.`)
}

function escapeCsvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

const SETTINGS_TAB_VARIANTS = {
  enter: direction => ({ opacity: 0, x: direction > 0 ? 22 : -22 }),
  center: { opacity: 1, x: 0 },
  exit: direction => ({ opacity: 0, x: direction > 0 ? -16 : 16 })
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('information') // 'information' | 'banks' | 'categories' | 'delivery' | 'users'
  const [tabDirection, setTabDirection] = useState(1)
  const isOwner = Boolean(getStoredAdmin()?.isOwner)

  function selectTab(tab) {
    const currentIndex = SETTINGS_TAB_ORDER.indexOf(activeTab)
    const nextIndex = SETTINGS_TAB_ORDER.indexOf(tab)
    if (nextIndex === currentIndex) return
    setTabDirection(nextIndex > currentIndex ? 1 : -1)
    setActiveTab(tab)
  }

  // --- Users State ---
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [usersLoadError, setUsersLoadError] = useState('')
  const usersMutationRevisionRef = useRef(0)
  const [userSearch, setUserSearch] = useState('')
  const [editingUser, setEditingUser] = useState(null)
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [userFormData, setUserFormData] = useState({ name: '', phone: '', address: '', password: '', membership: 'Standard' })
  const [newUserFormData, setNewUserFormData] = useState({ name: '', phone: '', address: '', password: '' })
  const [userSaveStatus, setUserSaveStatus] = useState('')
  const [addUserStatus, setAddUserStatus] = useState('')

  // --- Category Settings State ---
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [activeCategory, setActiveCategory] = useState(null)
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    description: '',
    subcategories: [],
    attributes: [
      { name: 'Color', options: ['Black', 'White', 'Red', 'Blue', 'Navy Blue', 'Yellow', 'Green'] },
      { name: 'Size', options: ['S', 'M', 'L', 'XL', '2XL'] }
    ]
  })
  const [optionInput, setOptionInput] = useState({})
  const [categorySaveStatus, setCategorySaveStatus] = useState('')

  // --- Shop Information / Sender Details State ---
  const [senderInfo, setSenderInfo] = useState({
    shopName: 'Win & Chit',
    phone: '09-123456789',
    address: 'Yangon, Myanmar',
    city: 'Yangon',
    tagline: 'Clothing Retail',
    note: 'Thank you for shopping with Win & Chit!'
  })
  const [infoSaveStatus, setInfoSaveStatus] = useState('')

  // --- Bank Accounts State ---
  const [bankAccounts, setBankAccounts] = useState([])
  const [editingBankIndex, setEditingBankIndex] = useState(null)
  const [bankFormData, setBankFormData] = useState({
    bankName: '',
    accountName: '',
    accountNumber: '',
    logoUrl: '',
    bgColor: '#003b82',
    textColor: '#ffffff',
    enabled: true
  })
  const [bankSaveStatus, setBankSaveStatus] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  // Delivery services (bus gates / courier companies)
  const [deliveryServices, setDeliveryServices] = useState([])
  const [editingDeliveryIdx, setEditingDeliveryIdx] = useState(null)
  const [deliveryForm, setDeliveryForm] = useState({ name: '', logoUrl: '', bgColor: '#1e293b', enabled: true })
  const [deliverySaveStatus, setDeliverySaveStatus] = useState('')
  const [uploadingDeliveryLogo, setUploadingDeliveryLogo] = useState(false)
  const [banners, setBanners] = useState([])
  const [bannerUrlInput, setBannerUrlInput] = useState('')
  const [uploadingBanners, setUploadingBanners] = useState(false)
  const [bannerSaveStatus, setBannerSaveStatus] = useState('')
  const [hostedImages, setHostedImages] = useState([])
  const [showHostedImages, setShowHostedImages] = useState(false)
  const [loadingHostedImages, setLoadingHostedImages] = useState(false)
  const [hostedImagesError, setHostedImagesError] = useState('')

  // Fetch Settings & Categories
  const fetchAllSettings = async () => {
    try {
      const res = await axios.get('/api/settings')
      if (res.data) {
        if (res.data.sender) setSenderInfo(res.data.sender)
        if (Array.isArray(res.data.bankAccounts)) setBankAccounts(res.data.bankAccounts)
        if (Array.isArray(res.data.deliveryServices)) setDeliveryServices(res.data.deliveryServices)
        if (Array.isArray(res.data.banners)) setBanners(res.data.banners)
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e)
    }
  }

  const fetchCategories = () => {
    setLoadingCategories(true)
    axios.get('/api/categories')
      .then(r => {
        setCategories(r.data || [])
        if (r.data && r.data.length > 0 && !activeCategory) {
          setActiveCategory(r.data[0])
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingCategories(false))
  }

  const fetchUsers = async () => {
    setLoadingUsers(true)
    setUsersLoadError('')
    const requestRevision = usersMutationRevisionRef.current
    try {
      const res = await axios.get('/api/users')
      if (requestRevision !== usersMutationRevisionRef.current) return
      let userList
      if (Array.isArray(res.data)) {
        userList = res.data
      } else if (res.data && Array.isArray(res.data.users)) {
        userList = res.data.users
      } else if (res.data && Array.isArray(res.data.data)) {
        userList = res.data.data
      }

      if (!Array.isArray(userList)) {
        throw new Error('The users API returned an invalid response.')
      }

      const normalizedUsers = userList.map(normalizeUser)
      setUsers(normalizedUsers)
      try {
        localStorage.setItem('winandchit_users', JSON.stringify(normalizedUsers))
      } catch (error) {
        console.error('Failed to update the cached users list:', error)
      }
    } catch (err) {
      if (requestRevision !== usersMutationRevisionRef.current) return
      const message = err.response?.data?.error || err.message || 'Failed to load users.'
      setUsersLoadError(message)
      console.error('Failed to fetch users from the database:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    fetchAllSettings()
    fetchCategories()
    fetchUsers()
  }, [])

  // --- User Management Handlers ---
  const startEditUser = (user) => {
    setEditingUser(user)
    setUserFormData({
      name: user.name || '',
      phone: user.phone || '',
      address: user.address || '',
      password: '',
      membership: resolveUserMembership(user)
    })
  }

  const cancelEditUser = () => {
    setEditingUser(null)
    setUserFormData({ name: '', phone: '', address: '', password: '', membership: 'Standard' })
    setUserSaveStatus('')
  }

  const startAddUser = () => {
    setIsAddingUser(true)
    setNewUserFormData({ name: '', phone: '', address: '', password: '' })
    setAddUserStatus('')
  }

  const cancelAddUser = () => {
    setIsAddingUser(false)
    setNewUserFormData({ name: '', phone: '', address: '', password: '' })
    setAddUserStatus('')
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    const cleanPhone = (newUserFormData.phone || '').trim()
    const cleanPassword = (newUserFormData.password || '').trim()

    if (!newUserFormData.name.trim()) return alert('Full name is required')
    if (!cleanPhone) return alert('Phone number is required')
    if (!/^[0-9]+$/.test(cleanPhone)) {
      return alert('Phone number must contain only numeric digits (0-9).')
    }
    if (!cleanPassword) return alert('Password is required')
    if (cleanPassword.length < 6) {
      return alert('Password must be at least 6 characters long.')
    }
    if (!/^[a-zA-Z0-9]+$/.test(cleanPassword)) {
      return alert('Password must contain only English letters and numbers (no special or Burmese characters).')
    }

    setAddUserStatus('saving')
    try {
      const payload = {
        name: newUserFormData.name.trim(),
        phone: cleanPhone,
        address: newUserFormData.address.trim(),
        password: cleanPassword
      }

      let createdUser
      try {
        const res = await axios.post('/api/users/register', payload)
        createdUser = res.data
      } catch (backendErr) {
        const errMsg = backendErr.response?.data?.error || backendErr.message || 'Failed to create user'
        alert(errMsg)
        setAddUserStatus('')
        return
      }

      // Add to state and local storage cache
      createdUser = normalizeUser(createdUser)
      setUsers(prev => [createdUser, ...prev.map(normalizeUser)])
      try {
        const raw = localStorage.getItem('winandchit_users')
        const list = raw ? JSON.parse(raw).map(normalizeUser) : []
        list.unshift(createdUser)
        localStorage.setItem('winandchit_users', JSON.stringify(list))
      } catch {}

      setAddUserStatus('success')
      setTimeout(() => {
        setIsAddingUser(false)
        setNewUserFormData({ name: '', phone: '', address: '', password: '' })
        setAddUserStatus('')
      }, 800)
    } catch (err) {
      alert('Error creating user: ' + (err.message || err))
      setAddUserStatus('')
    }
  }

  const handleSaveUser = async (e) => {
    e.preventDefault()
    if (!editingUser?._id) {
      alert('This user cannot be updated because it has no database ID. Refresh the users list and try again.')
      return
    }
    if (!userFormData.name.trim()) return alert('Name is required')
    if (!userFormData.phone.trim()) return alert('Phone number is required')

    setUserSaveStatus('saving')
    try {
      const cleanPhone = userFormData.phone.trim()
      if (!/^[0-9]+$/.test(cleanPhone)) {
        setUserSaveStatus('')
        return alert('Phone number must contain only numeric digits (0-9).')
      }
      const selectedMembership = userFormData.membership

      const payload = {
        name: userFormData.name.trim(),
        phone: cleanPhone,
        address: userFormData.address.trim(),
        membership: selectedMembership
      }

      // Only update password if admin entered a non-empty password
      if (userFormData.password && userFormData.password.trim()) {
        const cleanPassword = userFormData.password.trim()
        if (cleanPassword.length < 6) {
          setUserSaveStatus('')
          return alert('Password must be at least 6 characters long.')
        }
        if (!/^[a-zA-Z0-9]+$/.test(cleanPassword)) {
          setUserSaveStatus('')
          return alert('Password must contain only English letters and numbers (no special or Burmese characters).')
        }
        payload.password = cleanPassword
      }

      // Update in MongoDB database
      if (import.meta.env.DEV) {
        console.log('Editing user payload:', {
          ...payload,
          name: '[REDACTED]',
          phone: '[REDACTED]',
          address: '[REDACTED]',
          password: payload.password ? '[REDACTED]' : undefined
        })
      }
      if (import.meta.env.DEV) {
        console.debug('[user-edit] submitting', {
          userId: String(editingUser._id),
          fields: Object.keys(payload),
          membership: payload.membership
        })
      }
      const res = await axios.put(`/api/users/${editingUser._id}`, payload)
      const savedUser = res.data
      if (!savedUser?._id) {
        throw new Error('The server did not return the updated user profile.')
      }
      const updatedUser = {
        ...normalizeUser(savedUser),
        name: payload.name,
        phone: payload.phone,
        address: payload.address,
        membership: resolveUserMembership(savedUser)
      }

      usersMutationRevisionRef.current += 1
      const fallbackPhones = [editingUser.phone, cleanPhone]
      setUsers(prev => {
        const matchingRecord = findUserRecordIndex(prev, updatedUser, fallbackPhones)
        const nextUsers = replaceUserRecord(prev, updatedUser, fallbackPhones)
        if (import.meta.env.DEV) {
          console.debug('[user-edit] applying server response', {
            userId: String(updatedUser._id),
            membership: updatedUser.membership,
            matchedExistingRecord: matchingRecord !== -1
          })
        }
        return nextUsers
      })

      // update local storage cache
      try {
        const raw = localStorage.getItem('winandchit_users')
        const cachedUsers = raw ? JSON.parse(raw) : []
        const list = Array.isArray(cachedUsers) ? cachedUsers : []
        const matchingRecord = findUserRecordIndex(list, updatedUser, fallbackPhones)
        const nextUsers = replaceUserRecord(list, updatedUser, fallbackPhones)
        localStorage.setItem('winandchit_users', JSON.stringify(nextUsers))
        if (import.meta.env.DEV) {
          console.debug('[user-edit] updated local cache', {
            userId: String(updatedUser._id),
            membership: updatedUser.membership,
            matchedExistingRecord: matchingRecord !== -1
          })
        }
      } catch (error) {
        console.error('Failed to update the cached user profile:', error)
      }

      // Keep the signed-in profile current unless its login credentials changed.
      try {
        const currentSession = JSON.parse(localStorage.getItem('winandchit_auth_user') || 'null')
        const cur = currentSession ? normalizeUser(currentSession) : null
        const isEditingActiveUser = String(cur?._id || cur?.id || '') === String(editingUser._id)
          || cur?.phone === editingUser.phone
          || cur?.phone === cleanPhone
        if (isEditingActiveUser && (payload.password || payload.phone !== cur.phone)) {
          localStorage.removeItem('winandchit_auth_user')
        } else if (isEditingActiveUser) {
          localStorage.setItem('winandchit_auth_user', JSON.stringify({ ...cur, ...updatedUser }))
        }
      } catch {}
      notifyUserProfileUpdated(updatedUser)

      setUserSaveStatus('success')
      setTimeout(() => {
        setEditingUser(null)
        setUserFormData({ name: '', phone: '', address: '', password: '', membership: 'Standard' })
        setUserSaveStatus('')
      }, 1000)
    } catch (err) {
      alert('Failed to update user: ' + (err.response?.data?.error || err.message || err))
      setUserSaveStatus('')
    }
  }

  const handleExportUsers = () => {
    const headers = ['Name', 'Phone', 'Address', 'Membership', 'Status', 'Registration Date']
    const rows = filterUsersBySearch(users, userSearch).map(user => [
      user.name,
      user.phone,
      user.address,
      resolveUserMembership(user),
      user.isBlocked ? 'Blocked' : 'Active',
      user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : ''
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(escapeCsvValue).join(','))
      .join('\r\n')
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `user-accounts-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleToggleBlockUser = async (user) => {
    const actionName = user.isBlocked ? 'unblock' : 'block'
    if (!window.confirm(`Are you sure you want to ${actionName} user "${user.name}" (${user.phone})?`)) return

    try {
      if (!user._id) throw new Error('This user has no database ID and cannot be updated.')
      const res = await axios.patch(`/api/users/${user._id}/block`, { isBlocked: !user.isBlocked })
      const updatedUser = res.data
      if (!updatedUser?._id) throw new Error('The server did not return the updated user profile.')

      setUsers(prev => replaceUserRecord(prev, updatedUser, [user.phone]))

      // update local storage
      try {
        const raw = localStorage.getItem('winandchit_users')
        const cachedUsers = raw ? JSON.parse(raw) : []
        const list = Array.isArray(cachedUsers) ? cachedUsers : []
        localStorage.setItem('winandchit_users', JSON.stringify(replaceUserRecord(list, updatedUser, [user.phone])))
      } catch (error) {
        console.error('Failed to update the cached user status:', error)
      }

      if (updatedUser.isBlocked) {
        try {
          const cur = JSON.parse(localStorage.getItem('winandchit_auth_user') || 'null')
          if (cur?._id === updatedUser._id || cur?.phone === user.phone) {
            localStorage.removeItem('winandchit_auth_user')
            window.dispatchEvent(new Event('user-profile-updated'))
          }
        } catch {}
      }
    } catch (err) {
      alert(`Failed to ${actionName} user: ` + (err.response?.data?.error || err.message || err))
    }
  }

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Permanently delete account for "${user.name}"?`)) return
    try {
      try {
        await axios.delete(`/api/users/${user._id}`)
      } catch (backendErr) {
        console.warn('Backend delete error, updating local state:', backendErr)
      }

      setUsers(prev => prev.filter(u => !(u._id === user._id || u.phone === user.phone)))

      try {
        const raw = localStorage.getItem('winandchit_users')
        const cachedUsers = raw ? JSON.parse(raw) : []
        const list = Array.isArray(cachedUsers) ? cachedUsers.map(normalizeUser) : []
        const remaining = list.filter(u => !(u._id === user._id || u.phone === user.phone))
        localStorage.setItem('winandchit_users', JSON.stringify(remaining))
      } catch {}

      try {
        const currentSession = JSON.parse(localStorage.getItem('winandchit_auth_user') || 'null')
        const cur = currentSession ? normalizeUser(currentSession) : null
        if (cur?._id === user._id || cur?.phone === user.phone) {
          localStorage.removeItem('winandchit_auth_user')
        }
      } catch {}
    } catch (err) {
      alert('Failed to delete user: ' + (err.message || err))
    }
  }

  // --- Shop Info Save Handler ---
  const handleSaveShopInfo = async (e) => {
    e.preventDefault()
    setInfoSaveStatus('saving')
    try {
      const res = await axios.put('/api/settings', { sender: senderInfo })
      if (res.data?.sender) setSenderInfo(res.data.sender)
      setInfoSaveStatus('success')
      setTimeout(() => setInfoSaveStatus(''), 3500)
    } catch (err) {
      console.error(err)
      alert('Failed to save shop info: ' + (err.response?.data?.error || err.message))
      setInfoSaveStatus('')
    }
  }

  const handleBannerUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploadingBanners(true)
    const uploaded = []
    try {
      for (const file of files) {
        const data = new FormData()
        data.append('media', file)
        const response = await axios.post('/api/settings/upload-banner-media', data)
        if (response.data?.url) {
          uploaded.push({ url: response.data.url, enabled: true })
        }
      }
      if (uploaded.length > 0) {
        setBanners(current => [...current, ...uploaded])
      }
    } catch (error) {
      if (uploaded.length > 0) {
        setBanners(current => [...current, ...uploaded])
      }
      alert('Banner upload failed: ' + (error.response?.data?.error || error.message))
    } finally {
      setUploadingBanners(false)
      e.target.value = ''
    }
  }

  const handleLoadHostedImages = async () => {
    setLoadingHostedImages(true)
    setHostedImagesError('')
    try {
      const response = await axios.get('/api/settings/images', {
        params: { folder: 'products/banners', skip: 0, limit: 100 }
      })
      const body = response.data
      const images = Array.isArray(body)
        ? body
        : body?.images || body?.files || body?.items || body?.data || []
      setHostedImages(Array.isArray(images) ? images.filter(image => typeof image === 'string' || image?.url) : [])
    } catch (error) {
      setHostedImagesError(error.response?.data?.error || error.message || 'Could not load hosted images')
    } finally {
      setLoadingHostedImages(false)
    }
  }

  const handleAddHostedImage = (image) => {
    const url = typeof image === 'string' ? image : image?.url
    if (!url) return
    setBanners(current => current.some(banner => banner.url === url)
      ? current
      : [...current, { url, enabled: true }])
  }

  const handleAddBannerFromUrl = () => {
    const url = bannerUrlInput.trim()
    if (!url) return
    setBanners(current => [...current, { url, enabled: true }])
    setBannerUrlInput('')
  }

  const handleToggleBanner = (idx) => {
    setBanners(current => current.map((banner, index) => (
      index === idx ? { ...banner, enabled: banner.enabled === false ? true : false } : banner
    )))
  }

  const handleDeleteBanner = (idx) => {
    setBanners(current => current.filter((_, index) => index !== idx))
  }

  const handleSaveBanners = async () => {
    setBannerSaveStatus('saving')
    try {
      const response = await axios.put('/api/settings', { banners })
      alertImageCleanup(response)
      if (!Array.isArray(response.data?.banners)) {
        throw new Error('The server did not return the saved banner list.')
      }
      setBanners(response.data.banners)
      setBannerSaveStatus('success')
      try {
        localStorage.setItem('settingsUpdatedAt', String(Date.now()))
      } catch (error) {
        console.error('Failed to notify other tabs about banner updates:', error)
      }
      window.dispatchEvent(new Event('settings-updated'))
      setTimeout(() => setBannerSaveStatus(''), 3000)
    } catch (error) {
      alert('Failed to save banners: ' + (error.response?.data?.error || error.message))
      setBannerSaveStatus('')
    }
  }

  // --- Bank Accounts Handlers ---
  const startAddBank = () => {
    setEditingBankIndex('new')
    setBankFormData({
      bankName: 'KBZPay (KPay)',
      accountName: senderInfo.shopName || 'Win & Chit',
      accountNumber: '',
      logoUrl: '',
      bgColor: '#003b82',
      textColor: '#ffffff',
      enabled: true
    })
  }

  const startEditBank = (idx) => {
    setEditingBankIndex(idx)
    setBankFormData({ ...bankAccounts[idx] })
  }

  const cancelBankEdit = () => {
    setEditingBankIndex(null)
  }

  const applyBankPreset = (preset) => {
    if (preset === 'kpay') {
      setBankFormData(prev => ({
        ...prev,
        bankName: 'KBZPay (KPay)',
        bgColor: '#003b82',
        textColor: '#ffffff'
      }))
    } else if (preset === 'wave') {
      setBankFormData(prev => ({
        ...prev,
        bankName: 'WavePay',
        bgColor: '#ffc800',
        textColor: '#1a1a1a'
      }))
    } else if (preset === 'cb') {
      setBankFormData(prev => ({
        ...prev,
        bankName: 'CB Pay',
        bgColor: '#ce0e2d',
        textColor: '#ffffff'
      }))
    } else if (preset === 'aya') {
      setBankFormData(prev => ({
        ...prev,
        bankName: 'AYA Pay',
        bgColor: '#b81c22',
        textColor: '#ffffff'
      }))
    } else if (preset === 'yoma') {
      setBankFormData(prev => ({
        ...prev,
        bankName: 'Yoma Bank / Next App',
        bgColor: '#990000',
        textColor: '#ffffff'
      }))
    } else if (preset === 'uab') {
      setBankFormData(prev => ({
        ...prev,
        bankName: 'uabpay / uab bank',
        bgColor: '#522398',
        textColor: '#ffffff'
      }))
    }
  }

  const handleBankLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const data = new FormData()
      data.append('logo', file)
      const res = await axios.post('/api/settings/upload-bank-logo', data)
      if (res.data?.url) {
        setBankFormData(prev => ({ ...prev, logoUrl: res.data.url }))
      }
    } catch (err) {
      alert('Logo upload failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSaveBankItem = async (e) => {
    e.preventDefault()
    if (!bankFormData.bankName.trim()) return alert('Please enter Bank / App Name')
    if (!bankFormData.accountNumber.trim()) return alert('Please enter Account Number')

    let updatedList = [...bankAccounts]
    if (editingBankIndex === 'new') {
      updatedList.push(bankFormData)
    } else if (typeof editingBankIndex === 'number') {
      updatedList[editingBankIndex] = bankFormData
    }

    setBankSaveStatus('saving')
    try {
      const res = await axios.put('/api/settings', { bankAccounts: updatedList })
      alertImageCleanup(res)
      if (res.data?.bankAccounts) setBankAccounts(res.data.bankAccounts)
      setEditingBankIndex(null)
      setBankSaveStatus('success')
      setTimeout(() => setBankSaveStatus(''), 3000)
    } catch (err) {
      console.error(err)
      alert('Failed to save bank accounts: ' + (err.response?.data?.error || err.message))
      setBankSaveStatus('')
    }
  }

  // --- Delivery Services Handlers ---
  const startAddDelivery = () => {
    setEditingDeliveryIdx('new')
    setDeliveryForm({ name: '', logoUrl: '', bgColor: '#1e293b', enabled: true })
  }

  const startEditDelivery = (idx) => {
    setEditingDeliveryIdx(idx)
    setDeliveryForm({ ...deliveryServices[idx] })
  }

  const cancelEditDelivery = () => {
    setEditingDeliveryIdx(null)
  }

  const handleDeliveryLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDeliveryLogo(true)
    try {
      const data = new FormData()
      data.append('logo', file)
      const res = await axios.post('/api/settings/upload-delivery-logo', data)
      if (res.data?.url) setDeliveryForm(prev => ({ ...prev, logoUrl: res.data.url }))
    } catch (err) {
      alert('Logo upload failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setUploadingDeliveryLogo(false)
    }
  }

  const handleSaveDelivery = async (e) => {
    e.preventDefault()
    if (!deliveryForm.name.trim()) return alert('Please enter delivery service or bus gate name')
    const updated = [...deliveryServices]
    if (editingDeliveryIdx === 'new') updated.push(deliveryForm)
    else if (typeof editingDeliveryIdx === 'number') updated[editingDeliveryIdx] = deliveryForm

    setDeliverySaveStatus('saving')
    try {
      const res = await axios.put('/api/settings', { sender: senderInfo, bankAccounts, deliveryServices: updated })
      alertImageCleanup(res)
      if (res.data?.deliveryServices) setDeliveryServices(res.data.deliveryServices)
      setEditingDeliveryIdx(null)
      setDeliverySaveStatus('success')
      setTimeout(() => setDeliverySaveStatus(''), 2500)
    } catch (err) {
      console.error(err)
      alert('Failed to save delivery services: ' + (err.response?.data?.error || err.message))
      setDeliverySaveStatus('')
    }
  }

  const handleDeleteDelivery = async (idx) => {
    if (!window.confirm('Delete this delivery service?')) return
    const updated = deliveryServices.filter((_, i) => i !== idx)
    try {
      const res = await axios.put('/api/settings', { sender: senderInfo, bankAccounts, deliveryServices: updated })
      alertImageCleanup(res)
      if (res.data?.deliveryServices) setDeliveryServices(res.data.deliveryServices)
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message))
    }
  }

  const handleToggleDeliveryEnabled = async (idx) => {
    const updated = deliveryServices.map((d, i) => i === idx ? { ...d, enabled: !d.enabled } : d)
    try {
      const res = await axios.put('/api/settings', { sender: senderInfo, bankAccounts, deliveryServices: updated })
      if (res.data?.deliveryServices) setDeliveryServices(res.data.deliveryServices)
    } catch (err) {
      alert('Toggle failed: ' + (err.response?.data?.error || err.message))
    }
  }

  const handleDeleteBank = async (idx) => {
    if (!window.confirm('Delete this bank account?')) return
    const updatedList = bankAccounts.filter((_, i) => i !== idx)
    try {
      const res = await axios.put('/api/settings', { bankAccounts: updatedList })
      alertImageCleanup(res)
      if (res.data?.bankAccounts) setBankAccounts(res.data.bankAccounts)
      if (editingBankIndex === idx) setEditingBankIndex(null)
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message))
    }
  }

  const handleToggleBankEnabled = async (idx) => {
    const updatedList = bankAccounts.map((b, i) => i === idx ? { ...b, enabled: !b.enabled } : b)
    try {
      const res = await axios.put('/api/settings', { bankAccounts: updatedList })
      if (res.data?.bankAccounts) setBankAccounts(res.data.bankAccounts)
    } catch (err) {
      alert('Toggle failed: ' + (err.response?.data?.error || err.message))
    }
  }

  // --- Category Handlers ---
  function startCreateCategory() {
    setIsEditingCategory(false)
    setCategoryFormData({
      name: '',
      description: '',
      subcategories: [],
      attributes: [
        { name: 'Attribute 1 (e.g. Color / Scent)', options: ['Option A', 'Option B'] },
        { name: 'Attribute 2 (e.g. Size / Volume)', options: ['50ml', '100ml'] }
      ]
    })
    setActiveCategory({ _id: 'new' })
  }

  function startEditCategory(cat) {
    setIsEditingCategory(true)
    setActiveCategory(cat)
    setCategoryFormData({
      name: cat.name,
      description: cat.description || '',
      subcategories: Array.isArray(cat.subcategories) ? [...cat.subcategories] : [],
      attributes: (cat.attributes && cat.attributes.length > 0)
        ? JSON.parse(JSON.stringify(cat.attributes))
        : [{ name: 'Color', options: [] }, { name: 'Size', options: [] }]
    })
  }

  function applyCategoryPreset(presetName) {
    if (presetName === 'clothing') {
      setCategoryFormData({
        name: 'Clothing',
        description: 'T-Shirts, Dresses, Shirts, Pants, Hoodies, and Jackets',
        attributes: [
          {
            name: 'Color',
            options: ['Black', 'White', 'Red', 'Blue', 'Navy Blue', 'Sky Blue', 'Green', 'Olive Green', 'Yellow', 'Pink', 'Purple', 'Grey', 'Brown', 'Beige', 'Maroon', 'Khaki', 'Pattern / Multi']
          },
          {
            name: 'Size',
            options: ['Free Size', 'XS', 'S', 'M', 'L', 'XL', '2XL (XXL)', '3XL', '4XL', '28', '29', '30', '31', '32', '33', '34', '36', '38']
          }
        ]
      })
    } else if (presetName === 'skincare') {
      setCategoryFormData({
        name: 'Face Cleaning & Skincare',
        description: 'Facial cleansers, foam, toner, moisturizers, serums, and masks',
        attributes: [
          {
            name: 'Scent / Active Ingredient',
            options: ['Tea Tree', 'Aloe Vera', 'Centella / Cica', 'Vitamin C', 'Hyaluronic Acid', 'Green Tea', 'Charcoal', 'Rice Water', 'Unscented']
          },
          {
            name: 'Volume / Pack Size',
            options: ['30ml', '50ml', '100ml', '120ml', '150ml', '200ml', '250ml', '50g', '100g', 'Single Pack', 'Set of 3']
          }
        ]
      })
    } else if (presetName === 'cosmetics') {
      setCategoryFormData({
        name: 'Cosmetics & Makeup',
        description: 'Lipsticks, foundation, cushion, powders, and blush',
        attributes: [
          {
            name: 'Shade / Color Tone',
            options: ['#01 Light Beige', '#02 Natural Beige', '#03 Warm Sand', 'Ruby Red', 'Nude Pink', 'Coral Rose', 'Cherry']
          },
          {
            name: 'Finish / Type',
            options: ['Matte', 'Velvet', 'Glossy', 'Dewy', 'Waterproof', 'Long-lasting']
          }
        ]
      })
    } else if (presetName === 'footwear') {
      setCategoryFormData({
        name: 'Footwear & Shoes',
        description: 'Sneakers, leather shoes, boots, and sandals',
        attributes: [
          {
            name: 'Color',
            options: ['Black', 'White', 'Grey', 'Brown', 'Navy', 'Beige', 'Red']
          },
          {
            name: 'Shoe Size (EU)',
            options: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45']
          }
        ]
      })
    } else if (presetName === 'food') {
      setCategoryFormData({
        name: 'Beverages & Snacks',
        description: 'Coffee, tea, juice, dried snacks, and bakery',
        attributes: [
          {
            name: 'Flavor / Blend',
            options: ['Original', 'Dark Roast', 'Matcha', 'Vanilla', 'Chocolate', 'Strawberry', 'Spicy', 'Cheese']
          },
          {
            name: 'Serving / Weight',
            options: ['Small (12oz)', 'Medium (16oz)', 'Large (22oz)', '100g', '250g', '500g', '1kg Pack']
          }
        ]
      })
    }
  }

  function addAttribute() {
    setCategoryFormData(prev => ({
      ...prev,
      attributes: [...prev.attributes, { name: `Custom Attribute #${prev.attributes.length + 1}`, options: [] }]
    }))
  }

  function updateAttributeName(index, name) {
    setCategoryFormData(prev => {
      const nextAttrs = [...prev.attributes]
      nextAttrs[index] = { ...nextAttrs[index], name }
      return { ...prev, attributes: nextAttrs }
    })
  }

  function removeAttribute(index) {
    setCategoryFormData(prev => ({
      ...prev,
      attributes: prev.attributes.filter((_, idx) => idx !== index)
    }))
  }

  function addOption(attrIndex) {
    const text = (optionInput[attrIndex] || '').trim()
    if (!text) return
    setCategoryFormData(prev => {
      const nextAttrs = [...prev.attributes]
      const currentOpts = nextAttrs[attrIndex].options || []
      if (!currentOpts.includes(text)) {
        nextAttrs[attrIndex] = { ...nextAttrs[attrIndex], options: [...currentOpts, text] }
      }
      return { ...prev, attributes: nextAttrs }
    })
    setOptionInput(prev => ({ ...prev, [attrIndex]: '' }))
  }

  // --- Sub-category helpers for Category Editor ---
  function addSubcategory() {
    const text = (categoryFormData.newSubcategory || '').trim()
    if (!text) return
    setCategoryFormData(prev => {
      const next = Array.from(new Set([...(prev.subcategories || []), text]))
      return { ...prev, subcategories: next, newSubcategory: '' }
    })
  }

  function removeSubcategory(index) {
    setCategoryFormData(prev => ({ ...prev, subcategories: (prev.subcategories || []).filter((_, i) => i !== index) }))
  }

  function removeOption(attrIndex, optIndex) {
    setCategoryFormData(prev => {
      const nextAttrs = [...prev.attributes]
      nextAttrs[attrIndex] = {
        ...nextAttrs[attrIndex],
        options: nextAttrs[attrIndex].options.filter((_, idx) => idx !== optIndex)
      }
      return { ...prev, attributes: nextAttrs }
    })
  }

  async function handleSaveCategory(e) {
    e.preventDefault()
    if (!categoryFormData.name.trim()) return alert('Please enter category name')

    setCategorySaveStatus('saving')
    try {
      if (isEditingCategory && activeCategory?._id && activeCategory._id !== 'new') {
        const res = await axios.put(`/api/categories/${activeCategory._id}`, categoryFormData)
        setCategories(prev => prev.map(c => c._id === activeCategory._id ? res.data : c))
        setActiveCategory(res.data)
      } else {
        const res = await axios.post('/api/categories', categoryFormData)
        setCategories(prev => [...prev, res.data])
        setActiveCategory(res.data)
        setIsEditingCategory(true)
      }
      setCategorySaveStatus('success')
      setTimeout(() => setCategorySaveStatus(''), 3000)
    } catch (err) {
      console.error(err)
      alert('Save failed: ' + (err.response?.data?.error || err.message))
      setCategorySaveStatus('')
    }
  }

  async function handleDeleteCategory(catId) {
    if (!window.confirm('Are you sure you want to delete this category?')) return
    try {
      await axios.delete(`/api/categories/${catId}`)
      const remaining = categories.filter(c => c._id !== catId)
      setCategories(remaining)
      if (remaining.length > 0) {
        startEditCategory(remaining[0])
      } else {
        startCreateCategory()
      }
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message))
    }
  }

  return (
    <div className="page-wrapper">
      <div className={`settings-sticky-controls${activeTab === 'users' ? ' settings-sticky-controls-users' : ''}`}>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Settings2 size={22} /> System &amp; Store Settings</h1>
          <p className="page-subtitle">
            Manage store settings, customer accounts, admin access, and dashboard permissions
          </p>
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="settings-nav-tabs" style={{ display: 'flex', gap: 10, borderBottom: '2px solid var(--border-default)', marginBottom: 24, paddingBottom: 2 }}>
        <button
          type="button"
          onClick={() => selectTab('information')}
          style={{
            padding: '10px 18px',
            fontSize: '0.95rem',
            fontWeight: 700,
            border: 'none',
            borderBottom: activeTab === 'information' ? '3px solid var(--color-primary)' : '3px solid transparent',
            background: 'transparent',
            color: activeTab === 'information' ? 'var(--color-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'var(--transition)'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Building2 size={16} /> Information (Shop &amp; Sender)</span>
        </button>

        <button
          type="button"
          onClick={() => selectTab('banks')}
          style={{
            padding: '10px 18px',
            fontSize: '0.95rem',
            fontWeight: 700,
            border: 'none',
            borderBottom: activeTab === 'banks' ? '3px solid var(--color-primary)' : '3px solid transparent',
            background: 'transparent',
            color: activeTab === 'banks' ? 'var(--color-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'var(--transition)'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CreditCard size={16} /> Bank Accounts ({bankAccounts.length})</span>
        </button>

            <button
              type="button"
              onClick={() => selectTab('categories')}
              style={{
                padding: '10px 18px',
                fontSize: '0.95rem',
                fontWeight: 700,
                border: 'none',
                borderBottom: activeTab === 'categories' ? '3px solid var(--color-primary)' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === 'categories' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'var(--transition)'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Tags size={16} /> Categories &amp; Variants ({categories.length})</span>
            </button>

            <button
              type="button"
              onClick={() => selectTab('delivery')}
              style={{
                padding: '10px 18px',
                fontSize: '0.95rem',
                fontWeight: 700,
                border: 'none',
                borderBottom: activeTab === 'delivery' ? '3px solid var(--color-primary)' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === 'delivery' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'var(--transition)'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Truck size={16} /> Delivery Services ({deliveryServices.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                selectTab('users')
                fetchUsers()
              }}
              style={{
                padding: '10px 18px',
                fontSize: '0.95rem',
                fontWeight: 700,
                border: 'none',
                borderBottom: activeTab === 'users' ? '3px solid var(--color-primary)' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === 'users' ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'var(--transition)'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={16} /> Users ({users.length})</span>
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => selectTab('admins')}
                style={{
                  padding: '10px 18px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  border: 'none',
                  borderBottom: activeTab === 'admins' ? '3px solid var(--color-primary)' : '3px solid transparent',
                  background: 'transparent',
                  color: activeTab === 'admins' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'var(--transition)'
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Shield size={16} /> Admin</span>
              </button>
            )}
          </div>

      {activeTab === 'users' && (
            <div className="settings-users-toolbar">
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={20} /> User Accounts &amp; Profiles
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Manage all registered customer accounts. Edit credentials, monitor contact details, or block suspicious users.
                </p>
              </div>

              <div className="settings-users-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={startAddUser}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                >
                  <Plus size={16} /> Add User
                </button>
                <div style={{ position: 'relative', minWidth: 300 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    className="form-input"
                    style={{ paddingLeft: 36, height: 38, fontSize: '0.88rem' }}
                    placeholder="Search by name, phone, or membership..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                  />
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportUsers} disabled={users.length === 0} title="Export all user accounts as CSV">
                  <Download size={14} /> Export CSV
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={fetchUsers} title="Refresh Users list">
                  Refresh
                </button>
              </div>
            </div>
      )}
      </div>

      <AnimatePresence mode="wait" initial={false} custom={tabDirection}>
        <motion.div
          key={activeTab}
          className="route-motion-frame"
          custom={tabDirection}
          variants={SETTINGS_TAB_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
      {/* ================= TAB 1: SHOP INFORMATION & SENDER DETAILS ================= */}
      {activeTab === 'information' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 600px) 1fr', gap: 24, alignItems: 'start' }}>
          <div className="card">
            <div style={{ marginBottom: 16, borderBottom: '1px solid var(--border-default)', paddingBottom: 12 }}>
              <h3 className="card-title" style={{ marginBottom: 4 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Building2 size={18} /> Store &amp; Sender (ပေးပို့သူ) Details</span>
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                These details will be dynamically printed on all shipping labels (as <strong>ပေးပို့သူ Sender</strong>) and customer receipt headers.
              </p>
            </div>

            <form onSubmit={handleSaveShopInfo} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Shop / Sender Name (ဆိုင်/ပေးပို့သူ အမည်) *</label>
                <input
                  className="form-input"
                  placeholder="e.g., Win & Chit"
                  value={senderInfo.shopName}
                  onChange={e => setSenderInfo({ ...senderInfo, shopName: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone Numbers (ဖုန်းနံပါတ်) *</label>
                <input
                  className="form-input"
                  placeholder="e.g., 09-123456789, 09-987654321"
                  value={senderInfo.phone}
                  onChange={e => setSenderInfo({ ...senderInfo, phone: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Full Address (လိပ်စာအပြည့်အစုံ) *</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="e.g., No. 123, Bogyoke Aung San Road, Pabedan Township, Yangon"
                  value={senderInfo.address}
                  onChange={e => setSenderInfo({ ...senderInfo, address: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">City / State (မြို့နယ်/မြို့)</label>
                  <input
                    className="form-input"
                    placeholder="e.g., Yangon"
                    value={senderInfo.city}
                    onChange={e => setSenderInfo({ ...senderInfo, city: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Shop Tagline / Subtitle</label>
                  <input
                    className="form-input"
                    placeholder="e.g., Clothing & Fashion Retail"
                    value={senderInfo.tagline}
                    onChange={e => setSenderInfo({ ...senderInfo, tagline: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Receipt Footer Note (ကျေးဇူးတင်စကား/မှတ်ချက်)</label>
                <input
                  className="form-input"
                  placeholder="e.g., Thank you for shopping with Win & Chit!"
                  value={senderInfo.note}
                  onChange={e => setSenderInfo({ ...senderInfo, note: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
                <div>
                  {infoSaveStatus === 'success' && (
                    <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.9rem' }}>
                      Sender &amp; Store Info Saved Successfully!
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={infoSaveStatus === 'saving'}
                >
                  {infoSaveStatus === 'saving' ? 'Saving...' : <><Save size={16} /> Save Information</>}
                </button>
              </div>
            </form>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {/* Live Preview Card */}
            <div className="card" style={{ background: 'var(--bg-surface-subtle)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Eye size={16} /> Live Sender Card Preview (On Shipping Label):</span>
              </h4>

              <div
                style={{
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: 16,
                  background: '#ffffff',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                  color: '#1e293b'
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    fontSize: '9px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    marginBottom: '10px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1'
                  }}
                >
                  ပေးပို့သူ (Sender)
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                  {senderInfo.shopName || 'Shop Name'}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                  {senderInfo.phone || '09-xxxxxxxxx'}
                </div>
                <div style={{ fontSize: '11.5px', lineHeight: 1.5, color: '#475569' }}>
                  {senderInfo.address || 'Address line...'}{senderInfo.city ? `, ${senderInfo.city}` : ''}
                </div>
              </div>

              <div style={{ marginTop: 20, padding: 12, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-default)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Lightbulb size={15} /> Tip on Shipping Labels:</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  When you click <strong>"Print Label"</strong> on any order in the Orders page, this Sender information will be rendered next to the customer's full address and delivery service.
                </p>
              </div>
            </div>

            <div className="card">
              <h4 className="card-title" style={{ marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><FolderOpen size={16} /> Home Banner Management</span>
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Upload multiple images or GIF files for the Home slider. Enabled banners are shown instantly on user Home.
              </p>

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  className="form-input"
                  placeholder="Paste banner image/GIF URL and click Add URL"
                  value={bannerUrlInput}
                  onChange={event => setBannerUrlInput(event.target.value)}
                />
                <button type="button" className="btn btn-secondary" onClick={handleAddBannerFromUrl}>
                  Add URL
                </button>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {uploadingBanners ? 'Uploading...' : <><Upload size={14} /> Upload Files</>}
                  <input type="file" accept="image/*,image/gif" multiple disabled={uploadingBanners} style={{ display: 'none' }} onChange={handleBannerUpload} />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const shouldOpen = !showHostedImages
                    setShowHostedImages(shouldOpen)
                    if (shouldOpen) handleLoadHostedImages()
                  }}
                >
                  <FolderOpen size={14} /> {showHostedImages ? 'Hide Hosted Images' : 'Browse Hosted Images'}
                </button>
              </div>

              {showHostedImages && (
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {loadingHostedImages && <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading hosted images...</span>}
                  {hostedImagesError && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.82rem' }}>{hostedImagesError}</span>}
                  {!loadingHostedImages && !hostedImagesError && hostedImages.length === 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No hosted banner images found.</span>
                  )}
                  {hostedImages.map((image, index) => {
                    const imageUrl = typeof image === 'string' ? image : image.url
                    return (
                      <div key={image.id || imageUrl || index} style={{ display: 'grid', gridTemplateColumns: '84px 1fr auto', gap: 8, alignItems: 'center', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 8 }}>
                        <img src={imageUrl} alt="" style={{ width: 84, height: 54, objectFit: 'cover', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }} />
                        <span style={{ minWidth: 0, color: 'var(--text-muted)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imageUrl}</span>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleAddHostedImage(image)} disabled={banners.some(banner => banner.url === imageUrl)}>
                          <Plus size={13} /> Add
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {banners.map((banner, idx) => (
                  <div key={`${banner.url}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '84px 1fr auto auto', gap: 8, alignItems: 'center', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 8 }}>
                    <img src={banner.url} alt="" style={{ width: 84, height: 54, objectFit: 'cover', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Banner {idx + 1}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.url}</div>
                    </div>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleToggleBanner(idx)}>
                      {banner.enabled === false ? 'Enable' : 'Disable'}
                    </button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDeleteBanner(idx)}><Trash2 size={13} /></button>
                  </div>
                ))}
                {banners.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No banners yet. Upload images or GIF files.</p>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                <span style={{ color: bannerSaveStatus === 'success' ? 'var(--color-success)' : 'var(--text-muted)', fontSize: '0.82rem', fontWeight: bannerSaveStatus === 'success' ? 700 : 500 }}>
                  {bannerSaveStatus === 'success' ? 'Banners saved and synced to Home.' : 'Save to publish on Home slider.'}
                </span>
                <button type="button" className="btn btn-primary" disabled={bannerSaveStatus === 'saving' || uploadingBanners} onClick={handleSaveBanners}>
                  {bannerSaveStatus === 'saving' ? 'Saving...' : <><Save size={15} /> Save Banners</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: BANK ACCOUNTS & PAYMENT OPTIONS ================= */}
      {activeTab === 'banks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><CreditCard size={18} /> Bank Accounts &amp; Payment Methods (ငွေပေးချေရန်ဘဏ်အကောင့်များ)</span>
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Customize multiple bank accounts, colors, and logos to display as payment transfer options on receipts and invoices.
              </p>
            </div>
            {editingBankIndex === null && (
              <button className="btn btn-primary" onClick={startAddBank}>
                <Plus size={16} /> Add New Bank Account
              </button>
            )}
          </div>

          {/* Bank Edit/Add Modal or Form */}
          {editingBankIndex !== null && (
            <div className="card" style={{ marginBottom: 24, border: '2px solid var(--color-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border-default)', paddingBottom: 10 }}>
                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem' }}>
                  {editingBankIndex === 'new' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={16} /> Add New Bank Account</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PencilLine size={16} /> Edit Bank Account</span>}
                </h4>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelBankEdit}>
                  <X size={14} /> Cancel
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ marginBottom: 16, background: 'var(--bg-surface-subtle)', padding: 10, borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Zap size={14} /> QUICK PRESETS:</span>
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyBankPreset('kpay')}>
                    KBZPay (KPay)
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyBankPreset('wave')}>
                    WavePay
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyBankPreset('cb')}>
                    CB Pay
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyBankPreset('aya')}>
                    AYA Pay
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyBankPreset('yoma')}>
                    Yoma Bank
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyBankPreset('uab')}>
                    uabpay
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveBankItem}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Bank / App Name (ဘဏ်/အက်ပ် အမည်) *</label>
                    <input
                      className="form-input"
                      placeholder="e.g., KBZPay (KPay), WavePay, CB Bank"
                      value={bankFormData.bankName}
                      onChange={e => setBankFormData({ ...bankFormData, bankName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Account Holder Name (အကောင့်ပိုင်ရှင်အမည်) *</label>
                    <input
                      className="form-input"
                      placeholder="e.g., Win & Chit, Daw Moe Moe"
                      value={bankFormData.accountName}
                      onChange={e => setBankFormData({ ...bankFormData, accountName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Account Number / Phone (အကောင့်နံပါတ် / ဖုန်း) *</label>
                    <input
                      className="form-input"
                      placeholder="e.g., 09-123456789, 0012-3456-7890"
                      value={bankFormData.accountNumber}
                      onChange={e => setBankFormData({ ...bankFormData, accountNumber: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Bank Logo Image URL (Optional)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="form-input"
                        placeholder="https://... or upload image"
                        value={bankFormData.logoUrl}
                        onChange={e => setBankFormData({ ...bankFormData, logoUrl: e.target.value })}
                      />
                      <label className="btn btn-secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                        {uploadingLogo ? 'Uploading...' : <><Upload size={14} /> Upload</>}
                        <input type="file" accept="image/*" onChange={handleBankLogoUpload} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>

                  {/* Color Customization */}
                  <div className="form-group">
                    <label className="form-label">Card Background Color (နောက်ခံအရောင်)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="color"
                        value={bankFormData.bgColor}
                        onChange={e => setBankFormData({ ...bankFormData, bgColor: e.target.value })}
                        style={{ width: 44, height: 38, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4 }}
                      />
                      <input
                        className="form-input"
                        style={{ width: 110 }}
                        value={bankFormData.bgColor}
                        onChange={e => setBankFormData({ ...bankFormData, bgColor: e.target.value })}
                      />
                      {/* Color dots */}
                      {['#003b82', '#ffc800', '#ce0e2d', '#b81c22', '#1e293b', '#059669', '#522398'].map(c => (
                        <div
                          key={c}
                          onClick={() => setBankFormData({ ...bankFormData, bgColor: c })}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: c,
                            cursor: 'pointer',
                            border: bankFormData.bgColor === c ? '2px solid #000' : '1px solid #ccc'
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Text Color (စာလုံးအရောင်)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="color"
                        value={bankFormData.textColor}
                        onChange={e => setBankFormData({ ...bankFormData, textColor: e.target.value })}
                        style={{ width: 44, height: 38, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4 }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => setBankFormData({ ...bankFormData, textColor: '#ffffff' })}
                      >
                        ⚪ White (#fff)
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => setBankFormData({ ...bankFormData, textColor: '#1a1a1a' })}
                      >
                        ⚫ Dark (#1a1a1a)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Card Preview */}
                <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Eye size={14} /> LIVE RECEIPT BADGE PREVIEW:</span>
                  </span>
                  <div style={{ maxWidth: 260 }}>
                    <div
                      style={{
                        backgroundColor: bankFormData.bgColor || '#1e293b',
                        color: bankFormData.textColor || '#ffffff',
                        borderRadius: 8,
                        padding: '12px 14px',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.12)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {bankFormData.logoUrl && (
                          <img
                            src={bankFormData.logoUrl}
                            alt=""
                            style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain', background: 'rgba(255,255,255,0.85)', padding: 1 }}
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        )}
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>{bankFormData.bankName || 'Bank Name'}</span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 2 }}>
                        {bankFormData.accountNumber || '0000-0000-0000'}
                      </div>
                      <div style={{ fontSize: '10.5px', opacity: 0.9 }}>
                        {bankFormData.accountName || 'Account Name'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save and Cancel buttons */}
                <div style={{ display: 'flex', gap: 10, marginTop: 18, borderTop: '1px solid var(--border-default)', paddingTop: 14 }}>
                  <button type="submit" className="btn btn-primary" disabled={bankSaveStatus === 'saving'}>
                    {bankSaveStatus === 'saving' ? 'Saving...' : <><Save size={16} /> Save Bank Account</>}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={cancelBankEdit}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Bank Accounts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {bankAccounts.map((b, idx) => (
              <div
                key={idx}
                className="card"
                style={{
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: b.enabled ? '1px solid var(--border-default)' : '1px dashed #cbd5e1',
                  opacity: b.enabled ? 1 : 0.65
                }}
              >
                {/* Bank Card Graphic */}
                <div
                  style={{
                    backgroundColor: b.bgColor || '#1e293b',
                    color: b.textColor || '#ffffff',
                    borderRadius: 8,
                    padding: '14px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                    marginBottom: 14
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {b.logoUrl && (
                        <img
                          src={b.logoUrl}
                          alt=""
                          style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain', background: 'rgba(255,255,255,0.9)', padding: 1 }}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      )}
                      <strong style={{ fontSize: '12px' }}>{b.bankName}</strong>
                    </div>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.2)' }}>
                      {b.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 4 }}>
                    {b.accountNumber}
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.9 }}>
                    {b.accountName}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
                  <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={b.enabled !== false}
                      onChange={() => handleToggleBankEnabled(idx)}
                    />
                    Show on Receipts
                  </label>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => startEditBank(idx)}
                      title="Edit Account"
                    >
                      <PencilLine size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteBank(idx)}
                      title="Delete Account"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {bankAccounts.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <div style={{ marginBottom: 8, display: 'inline-flex' }}><CreditCard size={30} /></div>
                <p>No bank accounts configured yet. Click "Add New Bank Account" to create your first payment option.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 4: DELIVERY SERVICES ================= */}
      {activeTab === 'delivery' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Truck size={18} /> Delivery Services & Bus Gates (ကားဂိတ်များ / ပို့ဆောင်ရေး)</span>
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                Manage delivery companies and bus gate names that appear in the POS Delivery Service dropdown.
              </p>
            </div>
            {editingDeliveryIdx === null && (
              <button className="btn btn-primary" onClick={startAddDelivery}>
                <Plus size={16} /> Add Delivery Service
              </button>
            )}
          </div>

          {editingDeliveryIdx !== null && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>{editingDeliveryIdx === 'new' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={16} /> Add Delivery Service</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PencilLine size={16} /> Edit Delivery Service</span>}</h4>
                <button className="btn btn-ghost btn-sm" onClick={cancelEditDelivery}><X size={14} /></button>
              </div>
              <form onSubmit={handleSaveDelivery}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Logo / Image</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="form-input" placeholder="https://... or upload image" value={deliveryForm.logoUrl} onChange={e => setDeliveryForm({ ...deliveryForm, logoUrl: e.target.value })} />
                      <label className="btn btn-secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                        {uploadingDeliveryLogo ? 'Uploading...' : 'Upload'}
                        <input type="file" accept="image/*" onChange={handleDeliveryLogoUpload} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Name (အမည်) *</label>
                    <input className="form-input" value={deliveryForm.name} onChange={e => setDeliveryForm({ ...deliveryForm, name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Background Color</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="color" value={deliveryForm.bgColor || '#1e293b'} onChange={e => setDeliveryForm({ ...deliveryForm, bgColor: e.target.value })} style={{ width: 44, height: 38, padding: 2, cursor: 'pointer' }} />
                      <input className="form-input" value={deliveryForm.bgColor || '#1e293b'} onChange={e => setDeliveryForm({ ...deliveryForm, bgColor: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="submit" className="btn btn-primary">{deliverySaveStatus === 'saving' ? 'Saving...' : 'Save'}</button>
                  <button type="button" className="btn btn-secondary" onClick={cancelEditDelivery}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {deliveryServices.map((d, idx) => (
              <div key={idx} className="card" style={{ padding: 12 }}>
                <div style={{ backgroundColor: d.bgColor || '#1e293b', color: '#ffffff', padding: 10, borderRadius: 'var(--radius-sm)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {d.logoUrl ? <img src={d.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'contain', background: '#ffffff', padding: 2 }} onError={e => { e.currentTarget.style.display = 'none' }} /> : <span style={{ display: 'inline-flex' }}><Truck size={18} /></span>}
                  <strong style={{ fontSize: '0.95rem' }}>{d.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={d.enabled !== false} onChange={() => handleToggleDeliveryEnabled(idx)} />
                      <span style={{ fontSize: '0.8rem' }}>{d.enabled ? 'Active' : 'Disabled'}</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditDelivery(idx)}><PencilLine size={14} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDelivery(idx)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {deliveryServices.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                <div style={{ marginBottom: 8, display: 'inline-flex' }}><Truck size={30} /></div>
                <p>No delivery services configured yet. Click "Add Delivery Service" to create one.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: CATEGORIES & ATTRIBUTES ================= */}
      {activeTab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Left Sidebar: Category List */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border-default)', paddingBottom: 8 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><FolderOpen size={16} /> Categories ({categories.length})</h3>
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                onClick={startCreateCategory}
              >
                <Plus size={12} /> New
              </button>
            </div>

            {loadingCategories ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading categories...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {categories.map(cat => {
                  const isActive = activeCategory?._id === cat._id
                  return (
                    <div
                      key={cat._id}
                      onClick={() => startEditCategory(cat)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        background: isActive ? 'var(--color-primary)' : 'var(--bg-surface)',
                        border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--border-default)'}`,
                        color: isActive ? '#ffffff' : 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'var(--transition)'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.9rem', display: 'block' }}>{cat.name}</strong>
                        <span style={{ fontSize: '0.75rem', color: isActive ? '#ffffff' : 'var(--text-muted)' }}>
                          {cat.attributes?.map(a => a.name).join(' • ') || 'No attributes'}
                        </span>
                      </div>
                      {isActive && <span style={{ display: 'inline-flex' }}><PencilLine size={13} /></span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Editor: Category & Attribute Form */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border-default)', paddingBottom: 12 }}>
              <div>
                <h3 className="card-title" style={{ marginBottom: 2 }}>
                  {activeCategory?._id === 'new' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={16} /> Create New Category</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PencilLine size={16} /> Edit "{categoryFormData.name || 'Category'}"</span>}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Customize attribute fields that will dynamically appear when adding products in this category.
                </p>
              </div>

              {activeCategory?._id && activeCategory._id !== 'new' && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteCategory(activeCategory._id)}
                >
                  <Trash2 size={14} /> Delete Category
                </button>
              )}
            </div>

            {/* Quick Preset Templates */}
            <div style={{ marginBottom: 20, background: 'var(--bg-surface-subtle)', padding: 12, borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Zap size={14} /> QUICK PRESET TEMPLATES:</span>
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyCategoryPreset('clothing')}>
                  <Shirt size={14} /> Clothing (Color / Size)
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyCategoryPreset('skincare')}>
                  <Droplets size={14} /> Face Cleaning (Scent / Volume)
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyCategoryPreset('cosmetics')}>
                  <Palette size={14} /> Cosmetics (Tone / Finish)
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyCategoryPreset('footwear')}>
                  <Footprints size={14} /> Footwear (Color / Shoe Size)
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyCategoryPreset('food')}>
                  <Coffee size={14} /> Beverages (Flavor / Size)
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="form-group">
                <label className="form-label">Category Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g., Face Cleaning & Skincare, Clothing, Footwear"
                  value={categoryFormData.name}
                  onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  className="form-input"
                  placeholder="Brief description of items in this category..."
                  value={categoryFormData.description}
                  onChange={e => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                />
              </div>

              {/* Sub-category Management */}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Puzzle size={16} /> Sub-categories</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Add, view, and delete sub-categories for this main category (e.g., Girl, Boy, Baby).</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input
                    className="form-input"
                    placeholder="Add a sub-category (e.g., Girl, Men, Kids)"
                    value={categoryFormData.newSubcategory || ''}
                    onChange={e => setCategoryFormData({ ...categoryFormData, newSubcategory: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubcategory() } }}
                    style={{ flex: 1, maxWidth: 420 }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={addSubcategory}>+ Add</button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(categoryFormData.subcategories || []).length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No sub-categories yet.</div>
                  )}
                  {(categoryFormData.subcategories || []).map((sc, idx) => (
                    <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-surface-alt)', border: '1px solid var(--border-default)' }}>
                      <span style={{ fontSize: '0.9rem' }}>{sc}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeSubcategory(idx)} title="Remove sub-category"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Dynamic Attributes Editor */}
              <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><SwatchBook size={16} /> Variant Attributes &amp; Dropdown Options</span>
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Define variant dimensions (e.g. Attribute 1: Scent / Flavor, Attribute 2: Volume / Size) and selectable options.
                    </p>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addAttribute}>
                    <PackagePlus size={14} /> Add Attribute Dimension
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {categoryFormData.attributes.map((attr, aIdx) => (
                    <div
                      key={aIdx}
                      style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        padding: 16,
                        background: 'var(--bg-surface)'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)', minWidth: 85 }}>
                          Attribute #{aIdx + 1}:
                        </span>
                        <input
                          className="form-input"
                          style={{ fontWeight: 600, padding: '6px 10px', fontSize: '0.9rem' }}
                          placeholder="e.g. Color, Scent / Type, Volume (ml), Size"
                          value={attr.name}
                          onChange={e => updateAttributeName(aIdx, e.target.value)}
                          required
                        />
                        {categoryFormData.attributes.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: '4px 10px' }}
                            onClick={() => removeAttribute(aIdx)}
                            title="Remove this attribute"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {/* Pre-defined Options Tags */}
                      <div>
                        <label className="form-label" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                          Dropdown Options for "{attr.name || 'Attribute'}":
                        </label>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          {attr.options?.map((opt, oIdx) => (
                            <span
                              key={oIdx}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: 'var(--bg-surface-alt)',
                                border: '1px solid var(--border-default)',
                                padding: '3px 8px',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.8rem',
                                fontWeight: 500
                              }}
                            >
                              <span>{opt}</span>
                              <button
                                type="button"
                                onClick={() => removeOption(aIdx, oIdx)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                  padding: 0,
                                  lineHeight: 1
                                }}
                                title="Remove option"
                              >
                                  <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>

                        {/* Add Option Input Bar */}
                        <div style={{ display: 'flex', gap: 8, maxWidth: 380 }}>
                          <input
                            className="form-input"
                            style={{ padding: '5px 10px', fontSize: '0.85rem' }}
                            placeholder={`Add option (e.g. ${aIdx === 0 ? 'Tea Tree, Black' : '100ml, XL'})...`}
                            value={optionInput[aIdx] || ''}
                            onChange={e => setOptionInput({ ...optionInput, [aIdx]: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                addOption(aIdx)
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => addOption(aIdx)}
                          >
                            + Add Option
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
                <div>
                  {categorySaveStatus === 'success' && (
                    <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.9rem' }}>
                      Category &amp; Attributes Saved Successfully!
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={categorySaveStatus === 'saving'}
                >
                  {categorySaveStatus === 'saving' ? 'Saving...' : <><Save size={16} /> Save Category Settings</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= TAB 4: USERS MANAGEMENT ================= */}
      {activeTab === 'users' && (
        <div>
          {usersLoadError && (
            <p role="alert" style={{ color: 'var(--color-danger)', marginBottom: 14 }}>
              {usersLoadError}
            </p>
          )}

          {/* Add User Modal / Box */}
          {isAddingUser && (
            <div className="card" style={{ marginBottom: 20, border: '1px solid var(--color-primary)', background: 'linear-gradient(180deg, rgba(16, 55, 36, 0.96) 0%, rgba(10, 37, 24, 0.98) 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid var(--border-default)', paddingBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plus size={18} /> Create New User Account (MongoDB)
                </h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelAddUser}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateUser}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <UserIcon size={14} /> User Full Name *
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. Daw Khin Hnin"
                      value={newUserFormData.name}
                      onChange={e => setNewUserFormData({ ...newUserFormData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Phone size={14} /> Phone Number (0-9 only) *
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. 09123456789"
                      value={newUserFormData.phone}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '')
                        setNewUserFormData({ ...newUserFormData, phone: val })
                      }}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Lock size={14} /> Password (Min 6 letters/digits) *
                    </label>
                    <input
                      className="form-input"
                      type="password"
                      placeholder="Min 6 characters"
                      value={newUserFormData.password}
                      onChange={e => {
                        const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                        setNewUserFormData({ ...newUserFormData, password: val })
                      }}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={14} /> Full Delivery Address (ပို့ဆောင်မည့် လိပ်စာအပြည့်အစုံ)
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. No. 12, Bogyoke Street, Yangon"
                      value={newUserFormData.address}
                      onChange={e => setNewUserFormData({ ...newUserFormData, address: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    * This user will immediately be registered into MongoDB and can log in via the customer app.
                  </span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" className="btn btn-primary" disabled={addUserStatus === 'saving'}>
                      {addUserStatus === 'saving' ? 'Creating User...' : <><Save size={15} /> Save &amp; Create User</>}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={cancelAddUser}>
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Edit User Modal / Box */}
          {editingUser && (
            <div className="card" style={{ marginBottom: 20, border: '1px solid var(--color-primary)', background: 'linear-gradient(180deg, rgba(16, 55, 36, 0.96) 0%, rgba(10, 37, 24, 0.98) 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid var(--border-default)', paddingBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PencilLine size={18} /> Edit User: {editingUser.name} ({editingUser.phone})
                </h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEditUser}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveUser}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <UserIcon size={14} /> User Full Name *
                    </label>
                    <input
                      className="form-input"
                      value={userFormData.name}
                      onChange={e => setUserFormData({ ...userFormData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Phone size={14} /> Phone Number (0-9 only) *
                    </label>
                    <input
                      className="form-input"
                      value={userFormData.phone}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '')
                        setUserFormData({ ...userFormData, phone: val })
                      }}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Lock size={14} /> Password (စကားဝှက်)
                    </label>
                    <input
                      className="form-input"
                      type="password"
                      placeholder="Leave blank or min 6 alphanumeric"
                      value={userFormData.password}
                      onChange={e => {
                        const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                        setUserFormData({ ...userFormData, password: val })
                      }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Membership Tier</label>
                    <select
                      className="form-select"
                      value={userFormData.membership}
                      onChange={e => setUserFormData(previous => ({ ...previous, membership: e.target.value }))}
                    >
                      <option value="Standard">Standard Member</option>
                      <option value="Silver">Silver Member</option>
                      <option value="Gold">Gold Member</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={14} /> Full Delivery Address (လိပ်စာအပြည့်အစုံ)
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. No. 12, Bogyoke Street, Yangon"
                      value={userFormData.address}
                      onChange={e => setUserFormData({ ...userFormData, address: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    * Leave password blank to retain the current password. Updating credentials will automatically require the user to re-login.
                  </span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" className="btn btn-primary" disabled={userSaveStatus === 'saving'}>
                      {userSaveStatus === 'saving' ? 'Saving...' : <><Save size={15} /> Save &amp; Update User</>}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={cancelEditUser}>
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Users Table */}
          <div className="table-responsive settings-users-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th>Customer Profile</th>
                  <th>Phone Number</th>
                  <th>Full Address</th>
                  <th>Membership</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th style={{ textAlign: 'right', minWidth: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                      Loading users...
                    </td>
                  </tr>
                ) : (
                  filterUsersBySearch(users, userSearch)
                    .map((user, idx) => {
                      const isBlocked = Boolean(user.isBlocked)
                      return (
                        <tr
                          key={user._id || idx}
                          style={{
                            background: isBlocked ? 'rgba(216, 95, 95, 0.08)' : 'transparent',
                            opacity: isBlocked ? 0.8 : 1
                          }}
                        >
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{idx + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: '50%',
                                  background: isBlocked ? 'rgba(216, 95, 95, 0.2)' : 'linear-gradient(135deg, #fae084 0%, #aa7c11 100%)',
                                  color: isBlocked ? '#fca5a5' : '#042716',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 800,
                                  fontSize: '0.85rem',
                                  flexShrink: 0
                                }}
                              >
                                {(user.name || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong style={{ display: 'block', fontSize: '0.92rem', color: isBlocked ? '#fca5a5' : 'var(--text-primary)' }}>
                                  {user.name}
                                </strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {user.role || 'Customer'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-primary)' }}>
                              {user.phone}
                            </span>
                          </td>

                          <td style={{ maxWidth: 260 }}>
                            <span style={{ fontSize: '0.85rem', color: user.address ? 'var(--text-secondary)' : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {user.address ? <><MapPin size={13} style={{ flexShrink: 0 }} /> {user.address}</> : '— (No address specified)'}
                            </span>
                          </td>

                          <td>
                            <span className={`badge ${resolveUserMembership(user) === 'Gold' ? 'badge-primary' : resolveUserMembership(user) === 'Silver' ? 'badge-neutral' : 'badge-success'}`}>
                              {resolveUserMembership(user)}
                            </span>
                          </td>

                          <td>
                            {isBlocked ? (
                              <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <ShieldAlert size={12} /> Blocked
                              </span>
                            ) : (
                              <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle size={12} /> Active
                              </span>
                            )}
                          </td>

                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Recent'}
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              {/* Edit Button */}
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => startEditUser(user)}
                                title="Edit user details"
                              >
                                <PencilLine size={13} /> Edit
                              </button>

                              {/* Block / Unblock Button */}
                              <button
                                type="button"
                                className={isBlocked ? "btn btn-success btn-sm" : "btn btn-danger btn-sm"}
                                onClick={() => handleToggleBlockUser(user)}
                                title={isBlocked ? "Unblock this user account" : "Block this user account immediately"}
                              >
                                <ShieldAlert size={13} /> {isBlocked ? 'Unblock' : 'Block'}
                              </button>

                              {/* Delete Button */}
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteUser(user)}
                                title="Delete user"
                                style={{ padding: '5px 8px' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                )}

                {!loadingUsers && users.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'inline-flex', marginBottom: 8 }}><Users size={32} /></div>
                      <p style={{ margin: 0 }}>No customer accounts registered yet.</p>
                      <span style={{ fontSize: '0.8rem' }}>When users sign up on the storefront, their accounts will appear here automatically.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab === 'admins' && isOwner && <AdminManagement />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
