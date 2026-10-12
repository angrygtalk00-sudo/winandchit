import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { buildCartPricingData } from '../utils/promo'
import { PRODUCT_UPDATED_EVENT, PRODUCT_UPDATED_STORAGE_KEY } from '../utils/productUpdates'

const CartContext = createContext(null)
const STORAGE_KEY = 'winandchit_shop_cart'
const CHAT_ORDER_KEY = 'winandchit_shop_chat_order'

function itemKey(productId, sku) {
  return `${productId}::${sku || ''}`
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch (e) {
      return []
    }
  })
  const [chatOrderItem, setChatOrderItem] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_ORDER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch (e) {}
  }, [items])

  useEffect(() => {
    let canceled = false

    async function removeUnavailableCartItems() {
      const productIds = [...new Set([
        ...items.map(item => String(item.productId || '')).filter(Boolean),
        String(chatOrderItem?.productId || '')
      ].filter(Boolean))]
      if (productIds.length === 0) return

      try {
        const response = await axios.post('/api/products/active-lookup', { ids: productIds })
        if (canceled || !Array.isArray(response.data)) return
        const activeIds = new Set(response.data.map(product => String(product._id)))
        setItems(current => current.filter(item => activeIds.has(String(item.productId))))
        setChatOrderItem(current => (
          current && !activeIds.has(String(current.productId)) ? null : current
        ))
      } catch (error) {
        // Keep saved cart contents if the backend is temporarily unavailable.
      }
    }

    removeUnavailableCartItems()
    return () => { canceled = true }
  }, [])

  useEffect(() => {
    function removeDeletedProduct(update) {
      if (!update?.deleted || !update.productId) return
      const deletedId = String(update.productId)
      setItems(current => current.filter(item => String(item.productId) !== deletedId))
      setChatOrderItem(current => String(current?.productId || '') === deletedId ? null : current)
    }

    function onProductUpdated(event) {
      removeDeletedProduct(event.detail)
    }

    function onStorage(event) {
      if (event.key !== PRODUCT_UPDATED_STORAGE_KEY || !event.newValue) return
      try { removeDeletedProduct(JSON.parse(event.newValue)) } catch (error) {}
    }

    window.addEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Hydrate legacy cart items that were saved before promotion metadata existed.
  useEffect(() => {
    let canceled = false

    async function hydrateCartPromotions() {
      const needsHydration = items.some(item => typeof item.originalPrice === 'undefined' || typeof item.promo === 'undefined')
      if (!needsHydration || items.length === 0) return

      try {
        const response = await axios.get('/api/products')
        const products = Array.isArray(response.data) ? response.data : []
        const byId = new Map(products.map(product => [product?._id, product]))

        if (canceled) return

        setItems(current => current.map(item => {
          const product = byId.get(item.productId)
          if (!product) return item
          const variants = Array.isArray(product.variants) ? product.variants : []
          const variant = variants.find(v => String(v?.sku || '') === String(item.sku || '')) || variants[0] || null
          if (!variant) return item

          const pricing = buildCartPricingData(product, variant)
          return {
            ...item,
            // preserve user-visible current price if metadata already existed
            price: typeof item.price === 'number' ? item.price : pricing.price,
            originalPrice: typeof item.originalPrice === 'number' ? item.originalPrice : pricing.originalPrice,
            promo: typeof item.promo === 'undefined' ? pricing.promo : item.promo
          }
        }))
      } catch (e) {
        // keep cart usable even if hydration fails
      }
    }

    hydrateCartPromotions()
    return () => { canceled = true }
  }, [items])

  // Refresh cart pricing/promo metadata when promotions change globally (e.g., after checkout elsewhere)
  useEffect(() => {
    let canceled = false
    async function refreshPromotions() {
      try {
        const response = await axios.get('/api/products')
        const products = Array.isArray(response.data) ? response.data : []
        const byId = new Map(products.map(product => [product?._id, product]))
        if (canceled) return
        setItems(current => current.map(item => {
          const product = byId.get(item.productId)
          if (!product) return item
          const variants = Array.isArray(product.variants) ? product.variants : []
          const variant = variants.find(v => String(v?.sku || '') === String(item.sku || '')) || variants[0] || null
          if (!variant) return item
          const pricing = buildCartPricingData(product, variant)
          // If promotion is no longer active for this item, revert price/originalPrice/promo accordingly
          return {
            ...item,
            price: pricing.price,
            originalPrice: pricing.originalPrice,
            promo: pricing.promo
          }
        }))
      } catch (e) {
        // ignore errors
      }
    }

    function onPromotionsUpdated() { refreshPromotions() }
    function onStorage(e) {
      if (e.key === 'promotionsUpdatedAt') refreshPromotions()
    }

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

  useEffect(() => {
    try {
      if (chatOrderItem) localStorage.setItem(CHAT_ORDER_KEY, JSON.stringify(chatOrderItem))
      else localStorage.removeItem(CHAT_ORDER_KEY)
    } catch (e) {}
  }, [chatOrderItem])

  function addItem(entry, options = {}) {
    const incrementIfExists = options.incrementIfExists !== false
    setItems(current => {
      const key = itemKey(entry.productId, entry.sku)
      const existing = current.find(item => itemKey(item.productId, item.sku) === key)
      if (existing) {
        if (!incrementIfExists) {
          return current
        }
        const maxStock = Number(existing.stock)
        const nextQty = Number.isFinite(maxStock) && maxStock > 0
          ? Math.min(existing.qty + 1, maxStock)
          : existing.qty + 1
        return current.map(item => (item === existing ? { ...item, qty: nextQty } : item))
      }
      return [...current, { ...entry, qty: 1 }]
    })
  }

  function removeItem(productId, sku) {
    setItems(current => current.filter(item => itemKey(item.productId, item.sku) !== itemKey(productId, sku)))
  }

  function updateQty(productId, sku, qty) {
    setItems(current => current
      .map(item => {
        if (itemKey(item.productId, item.sku) !== itemKey(productId, sku)) return item
        const maxStock = Number(item.stock)
        const boundedQty = Number.isFinite(maxStock) && maxStock > 0
          ? Math.min(qty, maxStock)
          : qty
        return { ...item, qty: boundedQty }
      })
      .filter(item => item.qty > 0))
  }

  function updateItem(productId, sku, patch) {
    setItems(current => current.map(item => (itemKey(item.productId, item.sku) === itemKey(productId, sku) ? { ...item, ...patch } : item)))
  }

  function clear() {
    setItems([])
  }

  function setChatOrder(entry) {
    setChatOrderItem(entry || null)
  }

  function clearChatOrder() {
    setChatOrderItem(null)
  }

  const totalCount = useMemo(() => items.reduce((sum, item) => sum + item.qty, 0), [items])

  // Compute total price honoring quantity-limited promotions.
  const totalPrice = useMemo(() => {
    let total = 0
    for (const item of items) {
      const qty = Number(item.qty || 0)
      const originalUnit = Number(item.originalPrice || item.price || 0)

      const promo = item.promo || null
      if (promo && promo.enabled && promo.limitType === 'quantity') {
        const limitCount = Math.max(0, Number(promo.limitCount || 0))
        const soldCount = Math.max(0, Number(promo.soldCount || 0))
        const remaining = Math.max(0, limitCount - soldCount)

        const discountedUnit = Number(promo.discountedPrice || item.price || originalUnit)
        const discountedQty = Math.min(qty, remaining)
        const fullQty = qty - discountedQty

        total += discountedQty * discountedUnit + fullQty * originalUnit
      } else if (promo && promo.enabled && promo.discountedPrice) {
        // Time-limited or non-quantity-limited promotions: entire qty gets discounted
        const discountedUnit = Number(promo.discountedPrice || item.price || originalUnit)
        total += qty * discountedUnit
      } else {
        total += qty * originalUnit
      }
    }
    return total
  }, [items])

  const value = useMemo(() => ({
    items,
    addItem,
    removeItem,
    updateQty,
    updateItem,
    clear,
    totalCount,
    totalPrice,
    chatOrderItem,
    setChatOrder,
    clearChatOrder
  }), [items, totalCount, totalPrice, chatOrderItem])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
