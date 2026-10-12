// Utility for Promotions and Discounts

// Converts a Date or ISO string into local YYYY-MM-DDTHH:mm for datetime-local input
export function toLocalISOString(date, defaultHours = null, defaultMinutes = null) {
  const d = date ? new Date(date) : new Date()
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(defaultHours !== null ? defaultHours : d.getHours()).padStart(2, '0')
  const min = String(defaultMinutes !== null ? defaultMinutes : d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

export function getDefaultPromoTimes() {
  const now = new Date()
  return {
    start: toLocalISOString(now, 12, 0),
    end: toLocalISOString(now, 23, 59)
  }
}

// Checks if promotion is currently active
export function isPromoActive(promo, variantSku = null) {
  if (!promo || !promo.enabled) return false

  // Check variant filter if specified
  if (promo.variantSku && variantSku && promo.variantSku !== variantSku) {
    return false
  }

  // Check limit type
  if (promo.limitType === 'quantity') {
    const limitCount = Number(promo.limitCount || 0)
    const soldCount = Number(promo.soldCount || 0)
    if (limitCount > 0 && soldCount >= limitCount) {
      return false
    }
    return true
  }

  // Default: By Time
  const now = Date.now()
  const nowDate = new Date()

  if (promo.startDate) {
    const s = new Date(promo.startDate).getTime()
    if (!isNaN(s)) {
      const startDate = new Date(promo.startDate)
      const isFutureDay = (
        startDate.getFullYear() > nowDate.getFullYear() ||
        (startDate.getFullYear() === nowDate.getFullYear() && startDate.getMonth() > nowDate.getMonth()) ||
        (startDate.getFullYear() === nowDate.getFullYear() && startDate.getMonth() === nowDate.getMonth() && startDate.getDate() > nowDate.getDate())
      )
      if (isFutureDay) return false
      if (startDate.toDateString() === nowDate.toDateString() && now < s) return false
    }
  }

  if (promo.endDate) {
    const e = new Date(promo.endDate).getTime()
    if (!isNaN(e)) {
      const endDate = new Date(promo.endDate)
      const isPastDay = (
        endDate.getFullYear() < nowDate.getFullYear() ||
        (endDate.getFullYear() === nowDate.getFullYear() && endDate.getMonth() < nowDate.getMonth()) ||
        (endDate.getFullYear() === nowDate.getFullYear() && endDate.getMonth() === nowDate.getMonth() && endDate.getDate() < nowDate.getDate())
      )
      if (isPastDay) return false
      if (!isPastDay && endDate.toDateString() === nowDate.toDateString() && now > e) {
        return false
      }
    }
  }

  return true
}

// Calculates promotional discount details for a product/variant
export function getPromoDetails(product, variant = null) {
  const basePrice = Number(variant ? variant.price : (product?.variants?.[0]?.price || 0))
  const promo = product?.promotion
  const sku = variant?.sku || null

  if (!isPromoActive(promo, sku)) {
    return {
      isActive: false,
      title: '',
      discountPercentage: 0,
      originalPrice: basePrice,
      discountedPrice: basePrice,
      hasDiscount: false
    }
  }

  const discountPercentage = Number(promo.discountPercentage || 0)
  const discountedPrice = Math.round(basePrice * (1 - discountPercentage / 100))

  return {
    isActive: true,
    title: promo.title || '',
    discountPercentage,
    originalPrice: basePrice,
    discountedPrice,
    hasDiscount: discountPercentage > 0
  }
}

// Returns normalized cart pricing + promotion metadata for a product variant.
export function buildCartPricingData(product, variant = null) {
  const basePrice = Number(variant ? variant.price : (product?.variants?.[0]?.price || 0))
  const promoDetails = getPromoDetails(product, variant)
  const promo = product?.promotion || {}

  const hasPromo = promoDetails.isActive && promoDetails.hasDiscount
  const price = hasPromo ? Number(promoDetails.discountedPrice || basePrice) : basePrice

  return {
    price,
    originalPrice: basePrice,
    promo: hasPromo ? {
      enabled: true,
      title: promoDetails.title || promo.title || 'Promotion',
      discountPercentage: Number(promoDetails.discountPercentage || 0),
      discountedPrice: Number(promoDetails.discountedPrice || price),
      endDate: promo.limitType === 'time' ? promo.endDate || null : null,
      limitType: promo.limitType || 'time',
      // Quantity limit fields (if promotion is quantity-based)
      limitCount: Number(promo.limitCount || 0),
      soldCount: Number(promo.soldCount || 0),
      variantSku: promo.variantSku || null
    } : null
  }
}
