import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Check, Copy, CreditCard, Minus, Plus, ShoppingBag, Trash2, Truck, Upload, X } from 'lucide-react'
import { motion, usePresence } from 'framer-motion'
import { useCart } from '../context/CartContext'

function resolveImage(image) {
  if (!image) return null
  return String(image).startsWith('http') ? image : `/api/products/images/${image}`
}
const CART_PORTAL_DURATION = 0.56
const CART_PORTAL_EASE = [0.22, 1, 0.36, 1]

export default function Cart() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isPresent, safeToRemove] = usePresence()
  const { items, updateQty, removeItem, totalPrice, updateItem, clear } = useCart()
  const [now, setNow] = useState(Date.now())
  const [variantStockMap, setVariantStockMap] = useState({})
  const [checkoutStep, setCheckoutStep] = useState(0)
  const [banks, setBanks] = useState([])
  const [deliveryServices, setDeliveryServices] = useState([])
  const [selectedBank, setSelectedBank] = useState('')
  const [selectedDeliveryService, setSelectedDeliveryService] = useState('')
  const [receiptFile, setReceiptFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [copied, setCopied] = useState(false)
  const entryTransitionRef = useRef({
    transitionType: location.state?.transitionType || '',
    transitionOrigin: location.state?.transitionOrigin || null
  })
  const transitionOrigin = entryTransitionRef.current.transitionOrigin
  const hasPortalTransition = entryTransitionRef.current.transitionType === 'cart-portal' && transitionOrigin
  const [isClosingPortal, setIsClosingPortal] = useState(false)
  const [details, setDetails] = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem('winandchit_auth_user') || 'null')
      return { name: user?.name || localStorage.getItem('winandchit_guest_name') || '', phone: user?.phone || localStorage.getItem('winandchit_guest_phone') || '', address: user?.address || '' }
    } catch (e) {
      return { name: '', phone: '', address: '' }
    }
  })

  useEffect(() => {
    if (isPresent) return undefined
    if (!hasPortalTransition) {
      safeToRemove?.()
      return undefined
    }
    setIsClosingPortal(true)
    const timer = window.setTimeout(() => safeToRemove?.(), Math.round(CART_PORTAL_DURATION * 1000))
    return () => window.clearTimeout(timer)
  }, [hasPortalTransition, isPresent, safeToRemove])

  const openCheckout = async () => {
    setCheckoutError('')
    setFieldErrors({})
    setCheckoutStep(1)
    try {
      const { data } = await axios.get('/api/settings')
      const activeBanks = (data?.bankAccounts || []).filter(bank => bank?.enabled !== false)
      const activeDeliveryServices = (data?.deliveryServices || []).filter(service => service?.enabled !== false)
      setBanks(activeBanks)
      setDeliveryServices(activeDeliveryServices)
      setSelectedBank(activeBanks[0]?.bankName || '')
      setSelectedDeliveryService('')
    } catch (err) {
      setCheckoutError('Payment methods are unavailable right now. Please try again.')
    }
  }

  useEffect(() => {
    if (!location.state?.openCheckout) return
    openCheckout()
    navigate(location.pathname, { replace: true, state: null })
  }, [location.key])

  const closeCheckout = () => {
    if (submitting) return
    setCheckoutStep(0)
    setReceiptFile(null)
    setCheckoutError('')
    setFieldErrors({})
  }

  const copyAccountNumber = async (number) => {
    try {
      await navigator.clipboard.writeText(number)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (e) {
      setCheckoutError('Could not copy the account number. Please copy it manually.')
    }
  }

  const submitOrder = async () => {
    const nextErrors = {
      name: !details.name.trim(),
      phone: !details.phone.trim(),
      address: !details.address.trim(),
      bank: !selectedBank,
      delivery: deliveryServices.length > 0 && !selectedDeliveryService,
      receipt: !receiptFile
    }
    if (Object.values(nextErrors).some(Boolean)) {
      setFieldErrors(nextErrors)
      setCheckoutError('Complete the highlighted fields and upload your transfer receipt before submitting.')
      return
    }

    setSubmitting(true)
    setCheckoutError('')
    setFieldErrors({})
    try {
      const uploadData = new FormData()
      uploadData.append('photo', receiptFile)
      const upload = await axios.post('/api/chat/upload-photo', uploadData)
      const user = JSON.parse(localStorage.getItem('winandchit_auth_user') || 'null')
      let guestId = localStorage.getItem('winandchit_guest_chat_id')
      if (!user && !guestId) {
        guestId = `guest_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
        localStorage.setItem('winandchit_guest_chat_id', guestId)
      }
      const conversationId = user ? `user_${user.id || user._id}` : guestId
      const response = await axios.post('/api/sales/pending-order', {
        items: items.map(item => ({
          productId: item.productId, sku: item.sku, title: item.title, color: item.color || '', size: item.size || item.variantLabel || '', image: item.image || '', qty: item.qty,
          unitPrice: item.price, originalPrice: item.originalPrice || item.price
        })),
        customer: { ...details, deliveryStation: selectedDeliveryService },
        paymentMethod: selectedBank,
        paymentSlipUrl: upload.data.url,
        total: totalPrice,
        conversationId,
        customerUserId: user?.id || user?._id || null
      })
      localStorage.setItem('winandchit_guest_name', details.name.trim())
      localStorage.setItem('winandchit_guest_phone', details.phone.trim())
      clear()
      setCheckoutStep(0)
      navigate('/message', { state: { orderSubmitted: response.data.receiptNumber } })
    } catch (err) {
      setCheckoutError(err.response?.data?.error || 'Could not submit your order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function isPromoActiveForItem(item, currentNow) {
    const promo = item?.promo
    if (!promo || !promo.enabled) return false
    if (!promo.endDate) return true
    const end = Number(new Date(promo.endDate).getTime())
    if (!Number.isFinite(end) || end <= 0) return false
    return end > currentNow
  }

  function formatCountdown(endDate, currentNow) {
    const end = Number(new Date(endDate).getTime())
    if (!Number.isFinite(end) || end <= 0) return '00:00:00'
    const diff = Math.max(0, end - currentNow)
    const sec = Math.floor(diff / 1000)
    const days = Math.floor(sec / 86400)
    const hours = Math.floor((sec % 86400) / 3600)
    const minutes = Math.floor((sec % 3600) / 60)
    const seconds = sec % 60
    if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch latest product variant stocks to display accurate remaining stock per cart item
  useEffect(() => {
    let canceled = false
    async function loadStocks() {
      try {
        const res = await fetch('/api/products')
        const data = await res.json()
        if (canceled) return
        const map = {}
        if (Array.isArray(data)) {
          for (const p of data) {
            const bySku = {}
            if (Array.isArray(p.variants)) {
              for (const v of p.variants) {
                const sku = String(v?.sku || '')
                bySku[sku] = Number(v?.stock || 0)
              }
            }
            map[p._id] = bySku
          }
        }
        setVariantStockMap(map)
      } catch (e) {
        // ignore
      }
    }
    loadStocks()
    // Also refresh when promotions change (soldCount may affect stock semantics)
    function onPromotionsUpdated() { loadStocks() }
    function onStorage(e) { if (e.key === 'promotionsUpdatedAt') loadStocks() }
    window.addEventListener('promotions-updated', onPromotionsUpdated)
    window.addEventListener('promotionsUpdated', onPromotionsUpdated)
    window.addEventListener('storage', onStorage)
    return () => {
      canceled = true
      window.removeEventListener('promotions-updated', onPromotionsUpdated)
      window.removeEventListener('promotionsUpdated', onPromotionsUpdated)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // expire promotions when time passes
  useEffect(() => {
    let changed = false
    items.forEach(item => {
      if (item?.promo?.enabled && !isPromoActiveForItem(item, now)) {
        // promotion expired -> revert price and remove promo
        updateItem(item.productId, item.sku, { price: item.originalPrice || item.price, promo: null, originalPrice: undefined })
        changed = true
      }
    })
    if (changed) {
      try { window.dispatchEvent(new CustomEvent('promotionsUpdated')) } catch {}
      try { localStorage.setItem('promotionsUpdatedAt', String(Date.now())) } catch {}
    }
  }, [now, items, updateItem])

  useEffect(() => {
    items.forEach(item => {
      const skuKey = String(item.sku || '')
      const fetchedStock = variantStockMap[item.productId]?.[skuKey]
      if (typeof fetchedStock !== 'number') return
      const normalizedStock = Math.max(0, Number(fetchedStock))
      if (item.stock !== normalizedStock) {
        updateItem(item.productId, item.sku, { stock: normalizedStock })
      }
      if (item.qty > normalizedStock) {
        updateQty(item.productId, item.sku, normalizedStock)
      }
    })
  }, [items, updateItem, updateQty, variantStockMap])

  if (items.length === 0) {
    return (
      <motion.div className="shop-page shop-page-centered" animate={{ opacity: isClosingPortal ? 0 : 1 }} transition={{ duration: 0.24 }}>
        {hasPortalTransition && (
          <motion.div
            className="cart-portal-transition cart-portal-transition-cart"
            style={{ left: transitionOrigin.x, top: transitionOrigin.y }}
            initial={{ scale: 0.04, opacity: 0.88 }}
            animate={isClosingPortal ? { scale: 0.04, opacity: 0.9 } : { scale: 140, opacity: 0 }}
            transition={{ duration: CART_PORTAL_DURATION, ease: CART_PORTAL_EASE }}
          />
        )}
        <div className="shop-empty-state">
          <div className="shop-empty-icon">
            <ShoppingBag size={34} strokeWidth={1.8} />
          </div>
          <h2>Your cart is empty</h2>
          <p>Browse the shop and tap the + button to add items.</p>
          <Link to="/" className="btn btn-primary">Start Shopping</Link>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div className="shop-page" animate={{ opacity: isClosingPortal ? 0 : 1 }} transition={{ duration: 0.24 }}>
      {hasPortalTransition && (
        <motion.div
          className="cart-portal-transition cart-portal-transition-cart"
          style={{ left: transitionOrigin.x, top: transitionOrigin.y }}
          initial={{ scale: 0.04, opacity: 0.88 }}
          animate={isClosingPortal ? { scale: 0.04, opacity: 0.9 } : { scale: 140, opacity: 0 }}
          transition={{ duration: CART_PORTAL_DURATION, ease: CART_PORTAL_EASE }}
        />
      )}
      <h1 className="shop-page-title">My Cart</h1>

      <div className="cart-list">
        {items.map(item => {
          const imgUrl = resolveImage(item.image)
          // Determine available stock: prefer item.stock if present, otherwise use fetched variantStockMap
          const skuKey = String(item.sku || '')
          const prodMap = variantStockMap[item.productId] || {}
          const fetchedStock = typeof prodMap[skuKey] === 'number' ? prodMap[skuKey] : null
          const availableStock = typeof item.stock === 'number'
            ? item.stock
            : (fetchedStock !== null ? fetchedStock : null)
          const maxAllowedQty = availableStock !== null ? Math.max(0, Number(availableStock)) : null

          return (
            <div className="cart-item" key={`${item.productId}::${item.sku || ''}`}>
              <div className="cart-item-img">
                {imgUrl ? <img src={imgUrl} alt={item.title} /> : <ShoppingBag size={22} strokeWidth={1.8} />}
              </div>
                  <div className="cart-item-info">
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="cart-item-title">{item.title}</span>
                      {item.promo && item.promo.enabled && (
                        <span className="cart-item-promo-badge" aria-hidden="true">{item.promo.title || 'Promotion'}</span>
                      )}
                    </span>
                    {item.variantLabel && <span className="cart-item-variant">{item.variantLabel}</span>}
                    {/* Inline SKU and stock metadata (compact, muted) */}
                    <div className="cart-item-meta">
                      <span className="cart-item-sku-inline">{item.sku || ''}</span>
                      {availableStock !== null && (
                        <span className="cart-item-stock-inline">{`Stock: ${availableStock}`}</span>
                      )}
                    </div>
                    {isPromoActiveForItem(item, now) ? (
                      <div className="cart-item-price-row">
                        <span className="cart-item-original">{(item.originalPrice || item.price || 0).toLocaleString()} Ks</span>
                        <span className="cart-item-discount-badge">-{Number(item.promo?.discountPercentage || 0)}%</span>
                        <span className="cart-item-price cart-item-price-discount">{(item.price || 0).toLocaleString()} Ks</span>
                        {item.promo?.endDate && <span className="cart-item-promo-countdown">{formatCountdown(item.promo.endDate, now)}</span>}
                      </div>
                    ) : (
                      <span className="cart-item-price">{(item.price || 0).toLocaleString()} Ks</span>
                    )}
                  </div>
              <div className="cart-item-actions">
                <div className="cart-qty-control">
                  <button
                    type="button"
                    onClick={() => updateQty(item.productId, item.sku, Math.max(0, item.qty - 1))}
                    aria-label="Decrease quantity"
                  >
                    <Minus size={14} />
                  </button>
                  <span>{item.qty}</span>
                  <button
                    type="button"
                    onClick={() => {
                      // Prevent increment beyond available stock (if known)
                      if (maxAllowedQty !== null && Number.isFinite(maxAllowedQty)) {
                        if (item.qty < maxAllowedQty) updateQty(item.productId, item.sku, item.qty + 1)
                      } else {
                        updateQty(item.productId, item.sku, item.qty + 1)
                      }
                    }}
                    aria-label="Increase quantity"
                    disabled={maxAllowedQty !== null && item.qty >= maxAllowedQty}
                    title={maxAllowedQty !== null && item.qty >= maxAllowedQty ? 'Stock limit reached' : 'Increase quantity'}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button type="button" className="cart-remove-btn" onClick={() => removeItem(item.productId, item.sku)} aria-label="Remove item">
                  <Trash2 size={16} />
                </button>
                
              </div>
            </div>
          )
        })}
      </div>

      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Subtotal</span>
          <strong>{totalPrice.toLocaleString()} Ks</strong>
        </div>
        <button type="button" className="btn btn-primary btn-block" onClick={openCheckout}>
          Checkout
        </button>
      </div>

      {checkoutStep > 0 && (
        <div className="checkout-backdrop" role="dialog" aria-modal="true" aria-label="Checkout">
          <div className="checkout-modal">
            <button type="button" className="checkout-close" onClick={closeCheckout} aria-label="Close checkout"><X size={18} /></button>
            {checkoutStep === 1 && (
              <>
                <p className="checkout-kicker">Step 1 of 3</p>
                <h2>Review your order</h2>
                <p>Are you sure you want to buy these items?</p>
                <div className="checkout-items">{items.map(item => <div key={`${item.productId}-${item.sku}`} className="checkout-item-row"><div className="checkout-item-product">{resolveImage(item.image) ? <img src={resolveImage(item.image)} alt="" /> : <div className="checkout-item-placeholder"><ShoppingBag size={15} /></div>}<span>{item.title} <small>{item.size || item.variantLabel || item.sku}</small> x{item.qty}</span></div><strong>{(item.price * item.qty).toLocaleString()} Ks</strong></div>)}</div>
                <div className="checkout-total">Total <strong>{totalPrice.toLocaleString()} Ks</strong></div>
                <div className="checkout-actions"><button type="button" className="btn btn-secondary" onClick={closeCheckout}>Not sure</button><button type="button" className="btn btn-primary" onClick={() => setCheckoutStep(2)}>Yes, I'm sure</button></div>
              </>
            )}
            {checkoutStep === 2 && (
              <>
                <p className="checkout-kicker">Step 2 of 3</p>
                <h2>Shipping &amp; payment</h2>
                <div className="checkout-fields">
                  <input className={`form-input ${fieldErrors.name ? 'checkout-field-error' : ''}`} placeholder="Full name" value={details.name} onChange={e => { setDetails({ ...details, name: e.target.value }); setFieldErrors(current => ({ ...current, name: false })) }} />
                  <input className={`form-input ${fieldErrors.phone ? 'checkout-field-error' : ''}`} placeholder="Phone number" value={details.phone} onChange={e => { setDetails({ ...details, phone: e.target.value }); setFieldErrors(current => ({ ...current, phone: false })) }} />
                  <textarea className={`form-textarea ${fieldErrors.address ? 'checkout-field-error' : ''}`} placeholder="Delivery address" value={details.address} onChange={e => { setDetails({ ...details, address: e.target.value }); setFieldErrors(current => ({ ...current, address: false })) }} />
                  <select className={`form-select ${fieldErrors.bank ? 'checkout-field-error' : ''}`} value={selectedBank} onChange={e => { setSelectedBank(e.target.value); setFieldErrors(current => ({ ...current, bank: false })) }}><option value="">Select a bank</option>{banks.map(bank => <option key={bank._id || bank.bankName} value={bank.bankName}>{bank.bankName}</option>)}</select>
                </div>
                {selectedBank && (() => { const bank = banks.find(entry => entry.bankName === selectedBank); return bank ? <div className="checkout-bank-card" style={{ background: bank.bgColor || 'var(--bg-surface-alt)', color: bank.textColor || '#fff' }}>{bank.logoUrl ? <img className="checkout-bank-logo" src={bank.logoUrl} alt="" onError={event => { event.currentTarget.style.display = 'none' }} /> : <CreditCard size={20} />}<div><strong>{bank.accountName}</strong><span>{bank.accountNumber}</span></div><button type="button" onClick={() => copyAccountNumber(bank.accountNumber)}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div> : null })()}
                <label className={`checkout-upload ${fieldErrors.receipt ? 'checkout-field-error' : ''}`}><Upload size={22} /><span><strong>{receiptFile ? 'Transfer receipt selected' : 'Upload transfer receipt'}</strong><small>{receiptFile ? receiptFile.name : 'Tap here to attach your payment screenshot'}</small></span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => { setReceiptFile(e.target.files?.[0] || null); setFieldErrors(current => ({ ...current, receipt: false })) }} /></label>
                {deliveryServices.length > 0 && <div className={`checkout-delivery-services ${fieldErrors.delivery ? 'checkout-field-error' : ''}`}><span className="checkout-delivery-label"><Truck size={15} /> Delivery service</span><div className="checkout-delivery-options">{deliveryServices.map(service => <button type="button" key={service._id || service.name} className={`checkout-delivery-option ${selectedDeliveryService === service.name ? 'selected' : ''}`} onClick={() => { setSelectedDeliveryService(service.name); setFieldErrors(current => ({ ...current, delivery: false })) }} style={{ '--delivery-color': service.bgColor || '#1e293b' }}>{service.logoUrl ? <img src={service.logoUrl} alt="" onError={event => { event.currentTarget.style.display = 'none' }} /> : <Truck size={19} />}<span>{service.name}</span><Check size={15} className="checkout-delivery-check" /></button>)}</div></div>}
                {checkoutError && <p className="checkout-error">{checkoutError}</p>}
                <div className="checkout-actions"><button type="button" className="btn btn-secondary" onClick={() => setCheckoutStep(1)}>Back</button><button type="button" className="btn btn-primary" onClick={submitOrder} disabled={submitting || banks.length === 0}>{submitting ? 'Submitting...' : 'Submit order'}</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
