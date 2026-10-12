import React, { useEffect, useRef, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import axios from 'axios'
import { openAdminReceipt } from '../utils/adminAuth'
import { Package2, ScanLine, Camera, ShoppingBag, ShoppingCart, CreditCard, Wallet, Landmark, ChevronUp, ChevronDown, Check, Truck, Eye, Printer, FileDown, Tags, Trash2 } from 'lucide-react'
import { ColorSwatch, getColorHex } from '../utils/colors'
import { useLocation } from 'react-router-dom'
import { getPromoDetails } from '../utils/promo'
import { PRODUCT_UPDATED_EVENT, PRODUCT_UPDATED_STORAGE_KEY } from '../utils/productUpdates'

function getVariantLabel(v) {
  if (v.attributes && typeof v.attributes === 'object' && Object.keys(v.attributes).length > 0) {
    const parts = Object.values(v.attributes).filter(Boolean)
    if (parts.length > 0) return parts.join(' • ')
  }
  return [v.color, v.size].filter(Boolean).join(' • ') || 'Default'
}

function repriceCartFromProducts(cart, products) {
  const productsById = new Map(products.map(product => [product._id, product]))
  return cart.flatMap(item => {
    const product = productsById.get(item.productId)
    const variant = product?.variants?.find(candidate => candidate.sku === item.sku)
    if (!product) return []
    if (!variant) return [item]

    const promo = getPromoDetails(product, variant)
    return [{
      ...item,
      unitPrice: promo.discountedPrice,
      originalPrice: promo.originalPrice,
      hasDiscount: promo.hasDiscount,
      discountPercentage: promo.discountPercentage,
      stock: Math.max(0, Number(variant.stock) || 0)
    }]
  })
}

function getCartItemStock(item, products) {
  const product = products.find(candidate => candidate._id === item.productId)
  const variant = product?.variants?.find(candidate => candidate.sku === item.sku)
  const stock = Number(variant?.stock ?? item.stock)
  return Number.isFinite(stock) ? Math.max(0, stock) : null
}

function PosProductCard({ product, onAddToCart, initialVariantIdx }) {
  const [activeVariantIdx, setActiveVariantIdx] = useState(initialVariantIdx || 0)
  useEffect(() => {
    if (typeof initialVariantIdx === 'number') setActiveVariantIdx(initialVariantIdx)
  }, [initialVariantIdx])
  const variants = product.variants || []
  const activeVariant = variants[activeVariantIdx] || variants[0] || null

  // Prefer gallery images as primary display; show variant image when variant selected
  const displayImage = (activeVariant && activeVariant.image)
    || (product.images && product.images.length ? product.images[0] : null)
  const imgUrl = displayImage
    ? (String(displayImage).startsWith('http') ? displayImage : `/api/products/images/${displayImage}`)
    : null

  const activeLabel = activeVariant ? getVariantLabel(activeVariant) : ''
  const activeColor = activeVariant?.color || activeVariant?.attributes?.Color || activeVariant?.attributes?.['Shade / Tone']
  const activePromo = getPromoDetails(product, activeVariant)
  const activeOutOfStock = Number(activeVariant?.stock) <= 0

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 10, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface-subtle)', transition: 'var(--transition)' }}>
      <div className={`pos-product-image ${activeOutOfStock ? 'out-of-stock' : ''}`}>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={product.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}><Package2 size={40} /></div>
        )}
        {activeOutOfStock && <span className="out-of-stock-overlay">Out of stock</span>}
        {activeLabel && (
          <span
            style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              fontSize: '0.65rem',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              maxWidth: '90%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {activeColor && <ColorSwatch color={activeColor} size={9} />}
            <span>{activeLabel}</span>
          </span>
        )}
      </div>

      <strong style={{ fontSize: '0.875rem', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={product.title}>
        {product.title}
      </strong>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
        {activeVariant ? (
          activePromo.hasDiscount ? (
            <span>
              <span style={{ color: '#ef4444', textDecoration: 'line-through', marginRight: 4 }}>
                {activePromo.originalPrice.toLocaleString()} Ks
              </span>
              <strong style={{ color: 'var(--color-primary)' }}>
                {activePromo.discountedPrice.toLocaleString()} Ks
              </strong> • Stock: {activeVariant.stock}
            </span>
          ) : (
            `${activeVariant.price.toLocaleString()} Ks • Stock: ${activeVariant.stock}`
          )
        ) : ''}
      </div>

      {/* Variant selection buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'auto' }}>
        {variants.map((v, vIdx) => {
          const isSelected = vIdx === activeVariantIdx
          const label = getVariantLabel(v)
          const varColor = v.color || v.attributes?.Color || v.attributes?.['Shade / Tone']
          const vPromo = getPromoDetails(product, v)
          const outOfStock = Number(v.stock) <= 0

          return (
            <button
              key={v.sku || vIdx}
              className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.75rem', padding: '4px 6px', justifyContent: 'space-between', display: 'flex' }}
              onMouseEnter={() => setActiveVariantIdx(vIdx)}
              onClick={() => {
                setActiveVariantIdx(vIdx)
                onAddToCart(product, v)
              }}
              disabled={outOfStock}
              title={outOfStock ? `${label} is out of stock` : `Click to add ${label} to cart`}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.image ? (
                  <img
                    src={String(v.image).startsWith('http') ? v.image : `/api/products/images/${v.image}`}
                    alt=""
                    style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none' }}
                  />
                ) : (
                  varColor && <ColorSwatch color={varColor} size={10} />
                )}
                <span>{label}</span>
              </span>
              <span style={{ marginLeft: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                {vPromo.hasDiscount && (
                  <span style={{ color: '#ef4444', textDecoration: 'line-through', fontSize: '0.65rem' }}>
                    {vPromo.originalPrice.toLocaleString()} Ks
                  </span>
                )}
                <strong>{vPromo.discountedPrice.toLocaleString()} Ks</strong>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function POS() {
  const [scanning, setScanning] = useState(false)
  const [cart, setCart] = useState([])
  const [lastSale, setLastSale] = useState(null)
  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [availableBankAccounts, setAvailableBankAccounts] = useState([])
  const [isPaymentDropdownOpen, setIsPaymentDropdownOpen] = useState(false)
  const paymentDropdownRef = useRef(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [deliveryStation, setDeliveryStation] = useState('')
  const [customerCity, setCustomerCity] = useState('')
  const [saleType, setSaleType] = useState('local') // 'local' or 'online'
  const [deliveryServices, setDeliveryServices] = useState([])
  const [customerPhoneRequired, setCustomerPhoneRequired] = useState(false)
  const [preselect, setPreselect] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const location = useLocation()
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [receiptHtml, setReceiptHtml] = useState('')
  
  const inputRef = useRef()
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printQuantity, setPrintQuantity] = useState(1)
  const [printSize, setPrintSize] = useState(() => {
    try {
      return localStorage.getItem('printStickerSize') || 'A4'
    } catch (e) {
      return 'A4'
    }
  })

  async function refreshProductsAndCart() {
    try {
      const { data: latestProducts } = await axios.get('/api/products')
      setProducts(latestProducts || [])
      setCart(previousCart => repriceCartFromProducts(previousCart, latestProducts || []))
    } catch (error) {
      console.error('Could not refresh POS pricing:', error)
    }
  }

  useEffect(() => {
    refreshProductsAndCart()
  }, [])

  useEffect(() => {
    function refreshAfterPromotionChange() {
      refreshProductsAndCart()
    }

    function refreshAfterProductChange(update) {
      if (update?.deleted && update.productId) {
        const deletedId = String(update.productId)
        setProducts(current => current.filter(product => String(product._id) !== deletedId))
        setCart(current => current.filter(item => String(item.productId) !== deletedId))
      }
      refreshProductsAndCart()
    }

    function refreshAfterStorageChange(event) {
      if (event.key === 'promotionsUpdatedAt') refreshProductsAndCart()
      if (event.key === PRODUCT_UPDATED_STORAGE_KEY && event.newValue) {
        try { refreshAfterProductChange(JSON.parse(event.newValue)) } catch (error) {}
      }
    }

    function onProductUpdated(event) {
      refreshAfterProductChange(event.detail)
    }

    window.addEventListener('promotions-updated', refreshAfterPromotionChange)
    window.addEventListener('storage', refreshAfterStorageChange)
    window.addEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
    return () => {
      window.removeEventListener('promotions-updated', refreshAfterPromotionChange)
      window.removeEventListener('storage', refreshAfterStorageChange)
      window.removeEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
    }
  }, [])

  useEffect(() => {
    const now = Date.now()
    const cartProductIds = new Set(cart.map(item => item.productId))
    const boundaries = products
      .filter(product => cartProductIds.has(product._id) && product.promotion?.enabled && product.promotion.limitType === 'time')
      .flatMap(product => [product.promotion.startDate, product.promotion.endDate])
      .map(value => new Date(value).getTime())
      .filter(timestamp => Number.isFinite(timestamp) && timestamp > now)

    if (!boundaries.length) return undefined

    const nextBoundary = Math.min(...boundaries)
    const timer = window.setTimeout(() => {
      setCart(previousCart => repriceCartFromProducts(previousCart, products))
    }, Math.max(0, nextBoundary - now) + 100)

    return () => window.clearTimeout(timer)
  }, [cart, products])

  // Persist cart in localStorage so it survives navigation and reloads
  useEffect(() => {
    try {
      const raw = localStorage.getItem('posCart')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setCart(parsed)
      }
    } catch (e) {
      console.warn('Could not restore POS cart from localStorage', e)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('posCart', JSON.stringify(cart || []))
    } catch (e) {
      console.warn('Could not persist POS cart to localStorage', e)
    }
  }, [cart])

  // Read pre-selected product/variant from Catalog Link state
  useEffect(() => {
    const st = location?.state
    if (st && st.productId) {
      setPreselect({ productId: st.productId, variantIdx: typeof st.variantIdx === 'number' ? st.variantIdx : 0 })
      axios.get(`/api/products/${st.productId}`).then(r => {
        const p = r.data
        setProducts(prev => {
          const exists = prev.find(x => x._id === p._id)
          if (!exists) return [p, ...prev]
          return prev
        })
        setProductSearch(p.title)
      }).catch(() => {})
    }
  }, [location])

  // Load delivery services and bank settings
  useEffect(() => {
    axios.get('/api/settings').then(r => {
      if (r.data?.bankAccounts && Array.isArray(r.data.bankAccounts)) {
        setAvailableBankAccounts(r.data.bankAccounts.filter(b => b.enabled !== false))
      }
      if (r.data?.deliveryServices && Array.isArray(r.data.deliveryServices)) {
        setDeliveryServices(r.data.deliveryServices.filter(s => s.enabled !== false))
      }
    }).catch(() => {})
  }, [])

  // Close payment dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (paymentDropdownRef.current && !paymentDropdownRef.current.contains(event.target)) {
        setIsPaymentDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const startCameraScanner = () => {
    if (scanning) return
    setScanning(true)
    const scanner = new Html5QrcodeScanner('reader', { fps: 10, qrbox: 250 }, false)
    scanner.render(
      result => {
        onScanResult(result)
        scanner.clear().catch(() => {})
        setScanning(false)
      },
      () => {}
    )
  }

  function onScanResult(text) {
    handleAddByCode(text)
  }

  async function handleAddByCode(code) {
    if (!code) return
    try {
      if (code.includes('|')) {
        const [productId, sku] = code.split('|')
        const p = await axios.get(`/api/products/${productId}`)
        const variant = p.data.variants.find(v => v.sku === sku)
        if (variant) {
          addToCart(p.data, variant)
          return
        }
      }
      const res = await axios.get('/api/products')
      const all = res.data
      for (const p of all) {
        const v = p.variants?.find(x => x.sku?.toLowerCase() === code.trim().toLowerCase())
        if (v) {
          addToCart(p, v)
          return
        }
      }
      alert(`Product with SKU or barcode "${code}" not found`)
    } catch (err) {
      console.error(err)
      alert('Product lookup failed')
    }
  }

  function addToCart(product, variant) {
    const availableStock = Math.max(0, Number(variant.stock) || 0)
    if (availableStock === 0) return

    const promoInfo = getPromoDetails(product, variant)
    const effectivePrice = promoInfo.discountedPrice

    const img = variant.image
      ? (String(variant.image).startsWith('http') ? variant.image : `/api/products/images/${variant.image}`)
      : (product.images && product.images.length
          ? (String(product.images[0]).startsWith('http') ? product.images[0] : `/api/products/images/${product.images[0]}`)
          : null)

    setCart(prev => {
      const existing = prev.find(item => item.productId === product._id && item.sku === variant.sku)
      if (existing) {
        if (existing.qty >= availableStock) return prev
        return prev.map(item =>
          item.productId === product._id && item.sku === variant.sku
            ? { ...item,
                qty: item.qty + 1,
                // Refresh pricing/discount fields in case promotion changed since the item was first added
                unitPrice: effectivePrice,
                originalPrice: promoInfo.originalPrice,
                hasDiscount: promoInfo.hasDiscount,
                discountPercentage: promoInfo.discountPercentage,
                stock: availableStock
              }
            : item
        )
      }
      return [
        ...prev,
        {
          productId: product._id,
          title: product.title,
          sku: variant.sku,
          color: variant.color || '',
          size: variant.size || '',
          unitPrice: effectivePrice,
          originalPrice: promoInfo.originalPrice,
          hasDiscount: promoInfo.hasDiscount,
          discountPercentage: promoInfo.discountPercentage,
          stock: availableStock,
          qty: 1,
          image: img
        }
      ]
    })
  }

  // Render print modal markup near the return root

  function updateQty(index, delta) {
    setCart(prev =>
      prev
        .map((item, idx) => {
          if (idx === index) {
            const newQty = item.qty + delta
            const availableStock = getCartItemStock(item, products)
            if (delta > 0 && availableStock !== null && newQty > availableStock) return item
            return newQty > 0 ? { ...item, qty: newQty } : null
          }
          return item
        })
        .filter(Boolean)
    )
  }

  function removeItem(index) {
    setCart(prev => prev.filter((_, idx) => idx !== index))
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0)
  const total = subtotal

  async function checkout() {
    if (!cart.length) return
    setIsSubmitting(true)
    try {
      const items = cart.map(c => ({
        productId: c.productId,
        sku: c.sku,
        qty: c.qty,
        unitPrice: c.unitPrice,
        originalPrice: c.originalPrice || c.unitPrice,
        hasDiscount: Boolean(c.hasDiscount),
        discountPercentage: Number(c.discountPercentage) || 0,
        title: c.title,
        color: c.color || '',
        size: c.size || '',
        image: c.image || ''
      }))

      const payload = {
        items,
        paymentMethod,
        saleType,
        status: saleType === 'local' ? 'completed' : 'new',
        cashier: 'POS Cashier',
        customer: (saleType === 'online' || customerName || customerPhone || customerAddress || deliveryStation) ? {
          name: customerName,
          phone: customerPhone,
          address: customerAddress,
          city: customerCity,
          deliveryStation
        } : undefined
      }

      const r = await axios.post('/api/sales/checkout', payload)
      alert(`Sale complete! Receipt: ${r.data.receiptNumber}`)
      
      setLastSale({ id: r.data.saleId, receiptNumber: r.data.receiptNumber })
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setCustomerAddress('')
      setDeliveryStation('')
      setCustomerCity('')

      // Auto open printable receipt
      try {
        const receiptUrl = `/api/sales/${r.data.saleId}/receipt?autoPrint=1`
        openAdminReceipt(receiptUrl).catch(error => alert(error.message || 'Could not open receipt'))
      } catch (e) {
        console.warn('Could not open receipt window', e)
      }
      // Notify other clients that promotions may have changed (soldCount updated)
      try { localStorage.setItem('promotionsUpdatedAt', String(Date.now())) } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('promotions-updated', { detail: Date.now() })) } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('promotionsUpdated')) } catch (e) {}
    } catch (e) {
      alert('Checkout failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  function openReceipt(autoPrint = false) {
    if (!lastSale) return alert('No recent sale to show')
    const url = `/api/sales/${lastSale.id}/receipt${autoPrint ? '?autoPrint=1' : ''}`
    openAdminReceipt(url).catch(error => alert(error.message || 'Could not open receipt'))
  }

  async function viewReceiptModal() {
    if (!lastSale) return alert('No recent sale to show')
    try {
      const r = await axios.get(`/api/sales/${lastSale.id}/receipt`, { responseType: 'text' })
      setReceiptHtml(r.data)
      setShowReceiptModal(true)
    } catch (e) {
      alert('Could not load receipt preview')
    }
  }

  async function printReceipt() {
    if (!lastSale) return alert('No recent sale to print')
    try {
      const r = await axios.get(`/api/sales/${lastSale.id}/receipt`, { responseType: 'text' })
      const win = window.open('', '_blank')
      if (!win) return alert('Popup blocked')
      const html = r.data + `<script>window.onload=function(){window.print();setTimeout(()=>window.close(),200);}</script>`
      win.document.open()
      win.document.write(html)
      win.document.close()
    } catch (e) {
      alert('Could not print receipt')
    }
  }

  function downloadPdf() {
    if (!lastSale) return alert('No recent sale to download')
    const url = `/api/sales/${lastSale.id}/receipt.pdf`
    openAdminReceipt(url).catch(error => alert(error.message || 'Could not download receipt'))
  }

  useEffect(() => {
    // Ensure default print quantity is 1 when modal opens
    if (showPrintModal) {
      setPrintQuantity(1)
    }
  }, [showPrintModal])

  // Persist print size changes
  useEffect(() => {
    try {
      localStorage.setItem('printStickerSize', printSize)
    } catch (e) {}
  }, [printSize])

  function handlePrintStickers() {
    if (!cart.length) return alert('No items to print')
    // Build printable HTML window with selected quantity and size
    const items = cart.map(i => ({ title: i.title, sku: i.sku, qty: i.qty }))
    const qty = printQuantity || 1
    const size = printSize || 'A4'
    const win = window.open('', '_blank')
    if (!win) return alert('Popup blocked')

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Barcode Stickers</title>
      <style>body{font-family:Arial;padding:12px} .sticker{display:inline-block;border:1px solid #ccc;padding:8px;margin:6px;width:200px;height:80px;text-align:center} .sku{font-weight:700;margin-top:6px}</style>
      </head><body><h3>Print Stickers - ${size} - Copies: ${qty}</h3>
      ${items.map(it => Array.from({length: qty}).map(() => `<div class="sticker"><div>${it.title}</div><div class="sku">${it.sku}</div></div>`).join('')).join('')}
      <script>window.onload=function(){window.print()}</script></body></html>`

    win.document.open()
    win.document.write(html)
    win.document.close()
    setShowPrintModal(false)
  }

  // Receipt preview modal close helper
  function closeReceiptModal() {
    setShowReceiptModal(false)
    setReceiptHtml('')
  }

  const filteredQuickProducts = products.filter(p =>
    !productSearch ||
    p.title?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.variants?.some(v => v.sku?.toLowerCase().includes(productSearch.toLowerCase()))
  )

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Point of Sale (POS)</h1>
          <p className="page-subtitle">Fast barcode scanning, cart management, and instant checkout</p>
        </div>
        {lastSale && (
          <div className="badge badge-success" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
            Last Sale: {lastSale.receiptNumber}
          </div>
        )}
      </div>

      <div className="pos-layout">
        {/* Left Column: Scanner & Quick Item Picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Hardware Barcode & Camera Scanner Card */}
          <div className="card">
            <h3 className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ScanLine size={18} /> Barcode & SKU Scanner</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <input
                  ref={inputRef}
                  className="form-input"
                  placeholder="Type or scan barcode / SKU (Press Enter)..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleAddByCode(e.target.value)
                      e.target.value = ''
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={startCameraScanner}
              >
                <Camera size={16} /> Scan with Camera
              </button>
            </div>
            {scanning && (
              <div style={{ marginTop: 16, background: '#000', borderRadius: 'var(--radius-md)', padding: 12 }}>
                <div id="reader" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}></div>
              </div>
            )}
          </div>

          {/* Quick product filter for pre-selected context */}
          <div className="card">
            <h3 className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ShoppingBag size={18} /> Quick Items</h3>
              <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" placeholder="Search or leave blank for all" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, maxHeight: 540, overflowY: 'auto' }}>
                {filteredQuickProducts.map(p => (
                  <PosProductCard
                    key={p._id}
                    product={p}
                    onAddToCart={addToCart}
                    initialVariantIdx={preselect && preselect.productId === p._id ? preselect.variantIdx : undefined}
                  />
                ))}
              </div>
            </div>
        </div>

        {/* Right Column: Cart & Checkout Panel */}
        <div className="pos-cart-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: 12 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}><ShoppingCart size={18} /> Current Cart</h3>
            <span className="badge badge-primary">{cart.length} items</span>
          </div>

          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 8, display: 'inline-flex' }}><ShoppingBag size={40} /></div>
              <p>Cart is empty</p>
              <span style={{ fontSize: '0.8rem' }}>Scan barcode or select items from the left</span>
            </div>
          ) : (
            <ul className="cart-items-list">
              {cart.map((item, idx) => {
                const availableStock = getCartItemStock(item, products)
                const outOfStock = availableStock === 0
                const stockLimitReached = availableStock !== null && item.qty >= availableStock
                return (
                <li key={`${item.productId}-${item.sku}-${idx}`} className="cart-item">
                  <div className={`cart-item-thumb-wrap ${outOfStock ? 'out-of-stock' : ''}`}>
                  {item.image ? (
                    <img src={item.image} alt={item.title} className="cart-item-thumb" />
                  ) : (
                    <div className="cart-item-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><Package2 size={18} /></div>
                  )}
                  {outOfStock && <span className="out-of-stock-overlay">Out</span>}
                  </div>

                  <div className="cart-item-info">
                    <div className="cart-item-title">{item.title}</div>
                    <div className="cart-item-sku" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {item.color && <ColorSwatch color={item.color} size={10} />}
                      <span>
                        {item.color && `${item.color} / `}{item.size && `${item.size} • `}{item.sku}
                      </span>
                    </div>
                    <div className="cart-item-price" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.hasDiscount ? (
                        <>
                          <span style={{ textDecoration: 'line-through', textDecorationColor: '#ef4444', color: '#ef4444', fontSize: '0.75rem' }}>
                            {item.originalPrice?.toLocaleString()} Ks
                          </span>
                          <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>
                            {item.unitPrice.toLocaleString()} Ks
                          </span>
                          <span style={{ background: 'var(--color-danger, #ef4444)', color: '#fff', fontSize: '0.65rem', padding: '1px 4px', borderRadius: 4, fontWeight: 700 }}>
                            -{item.discountPercentage}%
                          </span>
                        </>
                      ) : (
                        <span>{item.unitPrice.toLocaleString()} Ks</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: 24, height: 24, padding: 0 }}
                      onClick={() => updateQty(idx, -1)}
                    >
                      -
                    </button>
                    <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: 24, height: 24, padding: 0 }}
                      onClick={() => updateQty(idx, 1)}
                      disabled={stockLimitReached}
                      title={outOfStock ? 'Out of stock' : stockLimitReached ? 'Stock limit reached' : 'Increase quantity'}
                    >
                      +
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ width: 24, height: 24, padding: 0, marginLeft: 4 }}
                      onClick={() => removeItem(idx)}
                      title="Remove item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
                )
              })}
            </ul>
          )}

          {/* Payment Method Selector */}
          <div style={{ margin: '16px 0', borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CreditCard size={14} /> Payment Method (ငွေပေးချေမှုစနစ်)</span>
              </label>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                {paymentMethod === 'cash' ? 'Cash' : paymentMethod}
              </span>
            </div>

            {/* Custom Styled Dropdown */}
            <div ref={paymentDropdownRef} style={{ position: 'relative', marginBottom: 10 }}>
              {/* Trigger button showing current selection */}
              {(() => {
                const selectedBank = availableBankAccounts.find(b => b.bankName === paymentMethod)
                if (selectedBank) {
                  return (
                    <div
                      onClick={() => setIsPaymentDropdownOpen(!isPaymentDropdownOpen)}
                      style={{
                        backgroundColor: selectedBank.bgColor || '#1e293b',
                        color: selectedBank.textColor || '#ffffff',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                        border: '1.5px solid rgba(0,0,0,0.1)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {selectedBank.logoUrl ? (
                          <img
                            src={selectedBank.logoUrl}
                            alt=""
                            style={{ width: 26, height: 26, borderRadius: 4, objectFit: 'contain', background: '#fff', padding: 2, flexShrink: 0 }}
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        ) : (
                          <span style={{ display: 'inline-flex', flexShrink: 0 }}><Landmark size={18} /></span>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedBank.bankName}
                          </div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedBank.accountNumber} • {selectedBank.accountName}
                          </div>
                        </div>
                      </div>
                      <span style={{ display: 'inline-flex', opacity: 0.8, marginLeft: 8 }}>{isPaymentDropdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                    </div>
                  )
                }

                // Default Cash button
                return (
                  <div
                    onClick={() => setIsPaymentDropdownOpen(!isPaymentDropdownOpen)}
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1.5px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ display: 'inline-flex' }}><Wallet size={18} /></span>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Cash (ငွေသား)</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Direct Cash Payment at Counter</div>
                      </div>
                    </div>
                    <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }}>{isPaymentDropdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                  </div>
                )
              })()}

              {/* Dropdown Options List */}
              {isPaymentDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 6,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    zIndex: 50,
                    maxHeight: 320,
                    overflowY: 'auto',
                    padding: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  {/* Cash Option */}
                  <div
                    onClick={() => {
                      setPaymentMethod('cash')
                      setIsPaymentDropdownOpen(false)
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: paymentMethod === 'cash' ? 'var(--bg-surface-subtle)' : 'transparent',
                      border: paymentMethod === 'cash' ? '1.5px solid var(--color-primary)' : '1px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'var(--transition)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ display: 'inline-flex' }}><Wallet size={18} /></span>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Cash (ငွေသား)</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Direct Cash Payment</div>
                      </div>
                    </div>
                    {paymentMethod === 'cash' && <span style={{ color: 'var(--color-primary)', display: 'inline-flex' }}><Check size={15} /></span>}
                  </div>

                  {/* Dynamic Settings Banks */}
                  {availableBankAccounts.map(b => {
                    const isSelected = paymentMethod === b.bankName
                    return (
                      <div
                        key={b._id || b.bankName}
                        onClick={() => {
                          setPaymentMethod(b.bankName)
                          setIsPaymentDropdownOpen(false)
                        }}
                        style={{
                          backgroundColor: b.bgColor || '#1e293b',
                          color: b.textColor || '#ffffff',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                          border: isSelected ? '2px solid #ffffff' : '1px solid transparent',
                          transition: 'transform 0.1s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          {b.logoUrl ? (
                            <img
                              src={b.logoUrl}
                              alt=""
                              style={{ width: 26, height: 26, borderRadius: 4, objectFit: 'contain', background: '#ffffff', padding: 2, flexShrink: 0 }}
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <span style={{ display: 'inline-flex', flexShrink: 0 }}><Landmark size={18} /></span>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {b.bankName}
                            </div>
                            <div style={{ fontSize: '0.78rem', opacity: 0.9, letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {b.accountNumber} • {b.accountName}
                            </div>
                          </div>
                        </div>
                        {isSelected && <span style={{ display: 'inline-flex', marginLeft: 8 }}><Check size={16} /></span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick-select payment pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${paymentMethod === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                onClick={() => setPaymentMethod('cash')}
              >
                <Wallet size={13} /> Cash
              </button>
              {availableBankAccounts.map(b => {
                const isSelected = paymentMethod === b.bankName
                return (
                  <button
                    key={b._id || b.bankName}
                    type="button"
                    style={{
                      fontSize: '0.78rem',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      border: isSelected ? '2px solid var(--text-primary)' : '1px solid transparent',
                      backgroundColor: b.bgColor || '#1e293b',
                      color: b.textColor || '#ffffff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 600,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                    onClick={() => setPaymentMethod(b.bankName)}
                  >
                    {b.logoUrl && (
                      <img
                        src={b.logoUrl}
                        alt=""
                        style={{ width: 14, height: 14, borderRadius: 2, objectFit: 'contain', background: '#fff', padding: 1 }}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    )}
                    <span>{b.bankName}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="cart-summary">
            <div className="summary-row">
              <span>Items Count:</span>
              <span>{cart.reduce((s, i) => s + i.qty, 0)} pcs</span>
            </div>
            <div className="summary-row total">
              <span>Grand Total:</span>
              <span style={{ color: 'var(--color-primary)' }}>{total.toLocaleString()} Ks</span>
            </div>
          </div>

          <div style={{ marginTop: 12, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
            <label className="form-label" style={{ fontSize: '0.9rem', fontWeight: 700 }}>Sale Type</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className={`btn ${saleType === 'local' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSaleType('local')}>Local Sale</button>
              <button className={`btn ${saleType === 'online' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSaleType('online')}>Online Order</button>
            </div>

            {saleType === 'online' && (
              <div style={{ marginTop: 12 }}>
                <label className="form-label">Customer Name</label>
                <input className="form-input" value={customerName} onChange={e => setCustomerName(e.target.value)} />

                <label className="form-label" style={{ marginTop: 8 }}>Phone</label>
                <input className="form-input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />

                <label className="form-label" style={{ marginTop: 8 }}>Address</label>
                <input className="form-input" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />

                <label className="form-label" style={{ marginTop: 8 }}>City</label>
                <input className="form-input" value={customerCity} onChange={e => setCustomerCity(e.target.value)} />

                <label className="form-label" style={{ marginTop: 8 }}>Delivery Service</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {deliveryServices.map(service => {
                    const serviceId = service._id || service.id || service.name
                    const isSelected = deliveryStation === service.name
                    return (
                      <button
                        key={serviceId}
                        type="button"
                        onClick={() => setDeliveryStation(service.name)}
                        style={{
                          backgroundColor: service.bgColor || '#1e293b',
                          color: '#ffffff',
                          border: isSelected ? '2px solid var(--text-primary)' : '1px solid transparent',
                          borderRadius: 'var(--radius-sm)',
                          padding: '7px 10px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 700
                        }}
                      >
                        {service.logoUrl ? <img src={service.logoUrl} alt="" style={{ width: 18, height: 18, borderRadius: 2, objectFit: 'contain', background: '#ffffff', padding: 1 }} onError={e => { e.currentTarget.style.display = 'none' }} /> : <span style={{ display: 'inline-flex' }}><Truck size={16} /></span>}
                        <span>{service.name}</span>
                      </button>
                    )
                  })}
                  {deliveryServices.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No delivery services available</span>}
                </div>
              </div>
            )}
          </div>

          <button
            className="btn btn-primary btn-lg btn-block"
            style={{ marginTop: 16 }}
            onClick={checkout}
            disabled={cart.length === 0 || isSubmitting}
          >
            {isSubmitting ? 'Processing...' : `Complete Sale • ${total.toLocaleString()} Ks`}
          </button>

          {/* Receipt Actions */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              RECEIPT OPTIONS:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => viewReceiptModal()}
                disabled={!lastSale}
              >
                <Eye size={14} /> View
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => printReceipt()}
                disabled={!lastSale}
              >
                <Printer size={14} /> Print
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={downloadPdf}
                disabled={!lastSale}
              >
                <FileDown size={14} /> PDF
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Print Modal */}
      {showPrintModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal" style={{ width: 520, background: '#fff', borderRadius: 8, padding: 18 }}>
            <h3 style={{ marginTop: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Tags size={18} /> Print Barcode / Sticker</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Copies</label>
                <input type="number" min={1} className="form-input" value={printQuantity} onChange={e => setPrintQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))} />
              </div>
              <div style={{ width: 180 }}>
                <label className="form-label">Sticker Size</label>
                <select className="form-select" value={printSize} onChange={e => setPrintSize(e.target.value)}>
                  <option value="A4">A4 (Default)</option>
                  <option value="A5">A5</option>
                  <option value="Label-60x30">Label 60x30 mm</option>
                  <option value="Label-40x20">Label 40x20 mm</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowPrintModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePrintStickers}>Print</button>
            </div>
          </div>
        </div>
      )}
      {/* Receipt Preview Modal */}
      {showReceiptModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal" style={{ width: 640, maxHeight: '80vh', overflow: 'auto', background: '#fff', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Receipt Preview</h3>
              <div>
                <button className="btn btn-secondary" onClick={() => printReceipt()} style={{ marginRight: 8 }}>Print</button>
                <button className="btn btn-secondary" onClick={closeReceiptModal}>Close</button>
              </div>
            </div>
            <div style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: receiptHtml }} />
          </div>
        </div>
      )}
    </div>
  )
}
