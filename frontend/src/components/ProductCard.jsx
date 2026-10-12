import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Package2, Eye, Heart } from 'lucide-react'
import { getPromoDetails, buildCartPricingData } from '../utils/promo'
import { useCart } from '../context/CartContext'

function formatPromotionCountdown(milliseconds) {
  const remainingSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const days = Math.floor(remainingSeconds / 86400)
  const hours = Math.floor((remainingSeconds % 86400) / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60
  const time = [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
  return days > 0 ? `${days}d ${time}` : time
}

function formatCompactCount(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return '0'

  if (numeric >= 1000000) {
    return `${(numeric / 1000000).toFixed(numeric >= 10000000 ? 0 : 1).replace(/\.0$/, '')}M`
  }

  if (numeric >= 1000) {
    return `${(numeric / 1000).toFixed(numeric >= 10000 ? 0 : 1).replace(/\.0$/, '')}K`
  }

  return String(Math.round(numeric))
}

function ProductCard({ product, showPromoOverlay = true, enableVariantTicker = true, viewCount = 0, onOpenDetail }) {
  const navigate = useNavigate()
  const { addItem } = useCart()

  const variants = product.variants || []
  const [variantIdx, setVariantIdx] = useState(0)
  const selectedVariant = variants[variantIdx] || variants[0] || null
  const promoVariant = variants.find(variant => getPromoDetails(product, variant).hasDiscount) || null
  const galleryImages = useMemo(() => {
    const urls = []
    const seen = new Set()

    ;(product.images || []).forEach(image => {
      const src = String(image || '').trim()
      if (!src || seen.has(src)) return
      seen.add(src)
      urls.push(src.startsWith('http') ? src : `/api/products/images/${src}`)
    })

    return urls
  }, [product.images])

  const staticFallbackImage = useMemo(() => {
    if (galleryImages.length > 0) return galleryImages[0]
    const firstVariantImage = variants[0]?.image ? String(variants[0].image).trim() : ''
    return firstVariantImage ? (firstVariantImage.startsWith('http') ? firstVariantImage : `/api/products/images/${firstVariantImage}`) : null
  }, [galleryImages, variants])

  const [galleryIndex, setGalleryIndex] = useState(0)
  const displayImageUrl = galleryImages.length > 0 ? galleryImages[galleryIndex % galleryImages.length] : staticFallbackImage
  const productCardLayoutId = `product-card-${String(product._id)}`

  const currentPrice = Number(selectedVariant?.price || 0)
  const currentStock = Number(selectedVariant?.stock || 0)
  const promoInfo = getPromoDetails(product, selectedVariant)
  const promoCardInfo = promoVariant ? getPromoDetails(product, promoVariant) : promoInfo
  const hasPromo = promoInfo.isActive && promoInfo.hasDiscount
  const hasCardPromo = promoCardInfo.isActive && promoCardInfo.hasDiscount
  const displayPrice = hasPromo ? promoInfo.discountedPrice : currentPrice
  const variantLabel = [selectedVariant?.color, selectedVariant?.size].filter(Boolean).join(' • ') || 'Default'
  const variantColor = selectedVariant?.color || selectedVariant?.attributes?.Color || selectedVariant?.attributes?.['Shade / Tone'] || ''
  const promotion = product?.promotion || {}
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enableVariantTicker || variants.length <= 1) return undefined
    const interval = window.setInterval(() => {
      setVariantIdx(prev => (prev + 1) % variants.length)
    }, 2800)
    return () => window.clearInterval(interval)
  }, [enableVariantTicker, variants.length])

  useEffect(() => {
    if (galleryImages.length <= 1) {
      setGalleryIndex(0)
      return undefined
    }

    const interval = window.setInterval(() => {
      setGalleryIndex(prev => (prev + 1) % galleryImages.length)
    }, 1800)
    return () => window.clearInterval(interval)
  }, [galleryImages.length])

  const promotionStatus = useMemo(() => {
    if (!hasCardPromo) return ''

    if (promotion.limitType === 'time') {
      const end = new Date(promotion.endDate).getTime()
      if (Number.isFinite(end)) return `Ends in ${formatPromotionCountdown(end - now)}`
      return 'Limited time offer'
    }

    if (promotion.limitType === 'quantity') {
      const limitCount = Math.max(0, Number(promotion.limitCount || 0))
      const soldCount = Math.max(0, Number(promotion.soldCount || 0))
      if (limitCount > 0) return `Limit left: ${Math.max(0, limitCount - soldCount)}`
      return `Stock: ${currentStock}`
    }

    return 'Hot promotion'
  }, [currentStock, hasCardPromo, now, promotion.endDate, promotion.limitCount, promotion.limitType, promotion.soldCount])

  useEffect(() => {
    if (!hasCardPromo || promotion.limitType !== 'time') return undefined
    const end = new Date(promotion.endDate).getTime()
    if (!Number.isFinite(end)) return undefined

    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [hasCardPromo, promotion.endDate, promotion.limitType])

  function openDetail() {
    if (typeof onOpenDetail === 'function') onOpenDetail(product._id)
    navigate(`/product/${product._id}`, { state: { product, sharedProductTransition: true } })
  }

  function handleAddToCart(event) {
    event.stopPropagation()
    if (currentStock <= 0) return
    const cartPricing = buildCartPricingData(product, selectedVariant)
    addItem({
      productId: product._id,
      sku: selectedVariant?.sku || '',
      title: product.title,
      variantLabel,
      price: cartPricing.price,
      originalPrice: cartPricing.originalPrice,
      promo: cartPricing.promo,
      stock: Number(selectedVariant?.stock || 0),
      image: selectedVariant?.image || staticFallbackImage || ''
    })
  }

  return (
    <motion.article
      className="product-card"
      layoutId={productCardLayoutId}
      onClick={openDetail}
      role="button"
      tabIndex={0}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail() } }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98, boxShadow: '0 2px 8px rgba(16, 24, 40, 0.14)' }}
      transition={{
        layout: { type: 'tween', duration: 0.34, ease: [0.22, 1, 0.36, 1] },
        scale: { type: 'tween', duration: 0.08, ease: 'easeOut' },
        y: { type: 'tween', duration: 0.18, ease: 'easeOut' },
        boxShadow: { type: 'tween', duration: 0.08, ease: 'easeOut' }
      }}
    >
      <div className="product-img-box">
        {displayImageUrl ? (
          <motion.img
            src={displayImageUrl}
            alt={product.title}
            className="product-img"
            layoutId={`product-image-${String(product._id)}`}
            draggable={false}
            onError={e => { e.target.style.display = 'none' }}
            transition={{ layout: { type: 'tween', duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
          />
        ) : (
          <span className="product-img-placeholder"><Package2 size={38} strokeWidth={1.9} /></span>
        )}
        {hasCardPromo && showPromoOverlay && (
          <div className="product-card-promo-overlay">
            <span className="product-card-promo-overlay-title">{promoCardInfo.title || 'Hot Promotion'}</span>
            <span className="product-card-promo-overlay-discount">-{promoCardInfo.discountPercentage}%</span>
            <span className="product-card-promo-overlay-status">{promotionStatus}</span>
          </div>
        )}
        <div className="product-card-views-badge" aria-label="Product popularity">
          <Eye size={13} strokeWidth={2.2} />
          <span className="product-card-views-count">{formatCompactCount(viewCount)}</span>
          <Heart size={12} strokeWidth={2.3} className="product-card-views-heart" />
        </div>
      </div>

      <div className="product-content compact">
        <h3 className="product-name">{product.title}</h3>
        <div className="product-card-variant-info">
          <div className="variant-item" key={`cv-${variantIdx}`}>
            <span className="product-card-variant-label">
              {variantColor && <span className="product-card-variant-dot" style={{ backgroundColor: variantColor }} />}
              <span>{variantLabel}</span>
            </span>
            <span className={`product-card-variant-stock ${currentStock > 0 ? 'in' : 'out'}`}>
              {currentStock > 0 ? `${currentStock} pcs` : 'Out'}
            </span>
          </div>
        </div>

        <div className="product-price-row">
          <div className="product-price-wrap">
            <span
              className={`product-price-original ${hasPromo ? 'is-visible' : 'is-hidden'}`}
              aria-hidden={!hasPromo}
            >
              {hasPromo ? `${currentPrice.toLocaleString()} Ks` : '\u00A0'}
            </span>
            <span className={`product-price-main ${hasPromo ? 'promo' : 'regular'}`}>
              {displayPrice.toLocaleString()} Ks
            </span>
          </div>
          <button
            type="button"
            className="product-add-to-cart-btn"
            onClick={handleAddToCart}
            disabled={currentStock <= 0}
            title={currentStock > 0 ? 'Add to cart' : 'Out of stock'}
            aria-label="Add to cart"
          >
            <Plus size={17} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </motion.article>
  )
}

// Lightweight ErrorBoundary to avoid full app crash from card-level errors
import ErrorBoundary from './ErrorBoundary'

const ProductCardMemo = React.memo(ProductCard)
export default function ProductCardWithBoundary(props) {
  return (
    <ErrorBoundary>
      <ProductCardMemo {...props} />
    </ErrorBoundary>
  )
}