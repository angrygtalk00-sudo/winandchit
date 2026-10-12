import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import { Sparkles, Download, MessageCircle, ShoppingCart, Send, X, Loader2, Camera, WandSparkles, Play, ChevronDown, ChevronUp } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { getPromoDetails, buildCartPricingData } from '../utils/promo'
import { PRODUCT_UPDATED_EVENT, PRODUCT_UPDATED_STORAGE_KEY } from '../utils/productUpdates'
import { normalizeYouTubeEmbedUrl } from '../utils/youtube.mjs'

function toImageUrl(value) {
  if (!value) return null
  return String(value).startsWith('http') ? value : `/api/products/images/${value}`
}

function getVariantLabel(variant) {
  if (!variant) return 'Default'
  if (variant.attributes && typeof variant.attributes === 'object') {
    const values = Object.values(variant.attributes).filter(Boolean)
    if (values.length > 0) return values.join(' • ')
  }
  return [variant.color, variant.size].filter(Boolean).join(' • ') || 'Default'
}

function normalizeColor(variant) {
  return variant?.color || variant?.attributes?.Color || variant?.attributes?.['Shade / Tone'] || ''
}

function normalizeSize(variant) {
  return variant?.size || variant?.attributes?.Size || variant?.attributes?.['Size / Fit'] || ''
}

function formatPromotionCountdown(milliseconds) {
  const remainingSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const days = Math.floor(remainingSeconds / 86400)
  const hours = Math.floor((remainingSeconds % 86400) / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60
  const time = [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
  return days > 0 ? `${days}d ${time}` : time
}

const TRY_ON_PROCESSING_STEPS = [
  'AI is tailoring your outfit...',
  'Fitting clothes to your photo...',
  'Refining the look and lighting...',
  'Almost ready...'
]
const PRODUCT_EXIT_DURATION = 350
const COMMENT_SHEET_TRANSITION = { duration: 0.46, ease: [0.22, 1, 0.36, 1] }

function getCenterPointFromEvent(event) {
  const rect = event?.currentTarget?.getBoundingClientRect?.()
  if (!rect) return null
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

function resizeImageFileToDataUrl(file, maxEdge = 1280, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not load image'))
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const width = Math.max(1, Math.round(img.width * scale))
        const height = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas is not available'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })
}

async function toDataUrlFromImageUrl(src) {
  const response = await fetch(src)
  if (!response.ok) throw new Error('Could not load product image')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not convert image'))
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isPresent = useIsPresent()
  const [isExiting, setIsExiting] = useState(false)
  const exitIntentRef = useRef(false)
  const requestedSku = new URLSearchParams(location.search).get('sku') || ''
  const sharedProductLayoutId = location.state?.sharedProductTransition &&
    String(location.state.product?._id) === String(id)
    ? `product-card-${String(id)}`
    : undefined
  const { addItem } = useCart()

  const [product, setProduct] = useState(location.state?.product || null)
  const [loading, setLoading] = useState(!location.state?.product)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [thumbnailLoopEnabled, setThumbnailLoopEnabled] = useState(false)
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0)
  const [showDetails, setShowDetails] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [tryOnOpen, setTryOnOpen] = useState(false)
  const [uploadedPhoto, setUploadedPhoto] = useState('')
  const [generatedPhoto, setGeneratedPhoto] = useState('')
  const [tryOnLoading, setTryOnLoading] = useState(false)
  const [tryOnError, setTryOnError] = useState('')
  const [tryOnProcessingMessage, setTryOnProcessingMessage] = useState(TRY_ON_PROCESSING_STEPS[0])
  const [outOfStockNotice, setOutOfStockNotice] = useState(null)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [expandedCommentReplies, setExpandedCommentReplies] = useState({})
  const [focusedCommentId, setFocusedCommentId] = useState('')
  const [focusedThreadId, setFocusedThreadId] = useState('')
  const [highlightedCommentId, setHighlightedCommentId] = useState('')
  const [replyDrafts, setReplyDrafts] = useState({})
  const [replyingToCommentId, setReplyingToCommentId] = useState('')
  const [sendingReplyToId, setSendingReplyToId] = useState('')
  const [currentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('winandchit_auth_user') || 'null')
    } catch (err) {
      return null
    }
  })

  const galleryRef = useRef(null)
  const thumbnailRailRef = useRef(null)
  const thumbnailRailInitializedRef = useRef(false)
  const detailsRef = useRef(null)
  const tryOnFileInputRef = useRef(null)
  const commentInputRef = useRef(null)
  const replyInputRef = useRef(null)
  const galleryScrollSettleTimerRef = useRef(0)

  useEffect(() => {
    const entryIndex = window.history.state?.idx
    const onPopState = event => {
      const targetIndex = event.state?.idx
      if (typeof entryIndex !== 'number' || typeof targetIndex !== 'number' || targetIndex < entryIndex) {
        exitIntentRef.current = true
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!isPresent && exitIntentRef.current) setIsExiting(true)
  }, [isPresent])

  useEffect(() => {
    if (!tryOnLoading) {
      setTryOnProcessingMessage(TRY_ON_PROCESSING_STEPS[0])
      return undefined
    }

    let index = 0
    const timer = window.setInterval(() => {
      index = (index + 1) % TRY_ON_PROCESSING_STEPS.length
      setTryOnProcessingMessage(TRY_ON_PROCESSING_STEPS[index])
    }, 2400)

    return () => window.clearInterval(timer)
  }, [tryOnLoading])

  useEffect(() => {
    if (!commentsOpen || replyingToCommentId) return undefined
    const timer = window.setTimeout(() => {
      commentInputRef.current?.focus({ preventScroll: true })
    }, 280)
    return () => window.clearTimeout(timer)
  }, [commentsOpen, replyingToCommentId])

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const replyTo = query.get('replyTo')
    const openCommentComposer = query.get('comment') === '1'
    const commentId = query.get('commentId')
    if (!replyTo && !openCommentComposer && !commentId) return

    setCommentsOpen(true)
    if (replyTo) setReplyingToCommentId(replyTo)
    if (commentId) setFocusedCommentId(commentId)
    query.delete('replyTo')
    query.delete('comment')
    query.delete('commentId')
    navigate({
      pathname: location.pathname,
      search: query.toString() ? `?${query.toString()}` : ''
    }, { replace: true, state: location.state })
  }, [location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    if (!focusedCommentId) return
    const commentById = new Map(comments.map(comment => [String(comment._id), comment]))
    let target = commentById.get(focusedCommentId)
    if (!target) return
    while (target.parentCommentId && commentById.has(String(target.parentCommentId))) {
      target = commentById.get(String(target.parentCommentId))
    }
    const threadId = String(target._id)
    setFocusedThreadId(threadId)
    setExpandedCommentReplies(current => current[threadId] ? current : { ...current, [threadId]: true })
  }, [comments, focusedCommentId])

  useEffect(() => {
    if (!commentsOpen || !focusedCommentId || !focusedThreadId || !expandedCommentReplies[focusedThreadId]) return undefined
    const target = document.querySelector(`[data-comment-id="${focusedCommentId}"]`)
    if (!target) return undefined
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedCommentId(focusedCommentId)
    const timer = window.setTimeout(() => {
      setHighlightedCommentId('')
      setFocusedCommentId('')
      setFocusedThreadId('')
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [commentsOpen, comments, expandedCommentReplies, focusedCommentId, focusedThreadId])

  useEffect(() => {
    if (!replyingToCommentId || !comments.some(comment => String(comment._id) === replyingToCommentId)) return undefined
    const timer = window.setTimeout(() => {
      replyInputRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [comments, replyingToCommentId])

  useEffect(() => {
    let canceled = false

    const stateProduct = location.state?.product
    if (stateProduct && String(stateProduct._id) === String(id)) {
      setProduct(stateProduct)
      setLoading(false)
      setError('')
    }

    async function fetchProduct() {
      if (!stateProduct || String(stateProduct._id) !== String(id)) {
        setLoading(true)
        setProduct(null)
      }
      setError('')
      try {
        const response = await axios.get(`/api/products/${id}?_ts=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } })
        if (!canceled) setProduct(response.data || null)
      } catch (err) {
        if (!canceled) {
          if (err.response?.status === 404) setProduct(null)
          setError(err.response?.data?.error || err.message || 'Failed to load product')
        }
      } finally {
        if (!canceled) setLoading(false)
      }
    }

    fetchProduct()
    return () => { canceled = true }
  }, [id, location.state?.product])

  useEffect(() => {
    let canceled = false
    async function refreshProduct(update) {
      if (update?.deleted) {
        setProduct(null)
        setError('This product is no longer available.')
        return
      }
      try {
        const response = await axios.get(`/api/products/${id}`, { timeout: 12000 })
        if (!canceled) {
          setProduct(response.data || null)
          setError('')
        }
      } catch (err) {
        if (!canceled && err.response?.status === 404) {
          setProduct(null)
          setError('This product is no longer available.')
          return
        }
        if (!canceled) console.warn('Could not refresh updated product:', err.message)
      }
    }
    const matchesProduct = productId => !productId || String(productId) === String(id)
    const onProductUpdated = event => {
      if (matchesProduct(event.detail?.productId)) refreshProduct(event.detail)
    }
    const onProductUpdatedInAnotherTab = event => {
      if (event.key !== PRODUCT_UPDATED_STORAGE_KEY || !event.newValue) return
      try {
        const update = JSON.parse(event.newValue)
        if (matchesProduct(update.productId)) refreshProduct(update)
      } catch (error) {}
    }
    window.addEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
    window.addEventListener('storage', onProductUpdatedInAnotherTab)
    return () => {
      canceled = true
      window.removeEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
      window.removeEventListener('storage', onProductUpdatedInAnotherTab)
    }
  }, [id])

  const variants = product?.variants || []
    const displayVariants = useMemo(() => variants.map((variant, index) => ({ variant, index })).sort((a, b) => (Number(a.variant.stock || 0) <= 0) - (Number(b.variant.stock || 0) <= 0)), [variants])

  useEffect(() => {
    if (!id) return undefined
    let canceled = false
    const loadComments = () => axios.get(`/api/product-comments?productId=${id}`)
      .then(response => { if (!canceled) setComments(response.data || []) })
      .catch(() => { if (!canceled) setComments([]) })
    loadComments()
    const timer = window.setInterval(loadComments, 2500)
    return () => {
      canceled = true
      window.clearInterval(timer)
    }
  }, [id])
  const defaultVariant = variants[0] || null

  const productVideoUrl = useMemo(() => {
    if (!product) return null
    return normalizeYouTubeEmbedUrl(product.videoUrl || product.youtubeUrl || '')
  }, [product])

  const galleryItems = useMemo(() => {
    if (!product) return []

    const items = []
    const seen = new Set()

    if (productVideoUrl) {
      items.push({ kind: 'video', src: productVideoUrl, colorKey: '', label: 'Product video' })
    }

    variants.forEach(variant => {
      const src = toImageUrl(variant.image)
      if (!src || seen.has(src)) return
      seen.add(src)
      items.push({ kind: 'image', src, colorKey: normalizeColor(variant).toLowerCase(), label: getVariantLabel(variant) })
    })

    if (items.length === 0) {
      items.push({ kind: 'placeholder', src: null, colorKey: '', label: 'No image' })
    }

    return items
  }, [product, productVideoUrl, variants])

  const activeVideoUrl = useMemo(() => {
    if (!productVideoUrl || galleryItems[activeIndex]?.kind !== 'video') return null

    const url = new URL(productVideoUrl)
    url.searchParams.set('autoplay', '1')
    url.searchParams.set('enablejsapi', '1')
    return url.toString()
  }, [activeIndex, galleryItems, productVideoUrl])

  const variantToGalleryIndex = useMemo(() => {
    return variants.map(variant => {
      const src = toImageUrl(variant.image)
      if (!src) return productVideoUrl ? 1 : 0
      const index = galleryItems.findIndex(item => item.kind === 'image' && item.src === src)
      return index >= 0 ? index : productVideoUrl ? 1 : 0
    })
  }, [galleryItems, productVideoUrl, variants])

  useEffect(() => {
    if (requestedSku || variants.length === 0) return
    const promoIndex = variants.findIndex(variant => getPromoDetails(product, variant).hasDiscount)
    if (promoIndex < 0) return
    setSelectedVariantIdx(promoIndex)
    const galleryIndex = variantToGalleryIndex[promoIndex]
    if (Number.isFinite(galleryIndex)) {
      setActiveIndex(galleryIndex)
      const node = galleryRef.current
      if (node) {
        const width = node.clientWidth || 0
        node.scrollTo({ left: width * galleryIndex, behavior: 'auto' })
      }
    }
  }, [product, requestedSku, variantToGalleryIndex, variants])

  useEffect(() => {
    if (!requestedSku || variants.length === 0) return
    const requestedIndex = variants.findIndex(variant => variant.sku === requestedSku)
    if (requestedIndex < 0) return
    setSelectedVariantIdx(requestedIndex)
    const galleryIndex = variantToGalleryIndex[requestedIndex]
    if (!Number.isFinite(galleryIndex)) return
    setActiveIndex(galleryIndex)
    const node = galleryRef.current
    if (node) {
      node.scrollTo({ left: node.clientWidth * galleryIndex, behavior: 'auto' })
    }
  }, [requestedSku, variantToGalleryIndex, variants])

  useEffect(() => {
    if (selectedVariantIdx < variants.length) return
    setSelectedVariantIdx(0)
  }, [selectedVariantIdx, variants.length])

  useEffect(() => {
    const node = galleryRef.current
    if (!node) return undefined

    function updateActiveIndexFromScroll() {
      if (galleryScrollSettleTimerRef.current) {
        window.clearTimeout(galleryScrollSettleTimerRef.current)
        galleryScrollSettleTimerRef.current = 0
      }
      const itemWidth = node.clientWidth || 1
      const next = Math.round(node.scrollLeft / itemWidth)
      setActiveIndex(Math.max(0, Math.min(galleryItems.length - 1, next)))
    }

    function onScroll() {
      if (galleryScrollSettleTimerRef.current) {
        window.clearTimeout(galleryScrollSettleTimerRef.current)
      }
      galleryScrollSettleTimerRef.current = window.setTimeout(updateActiveIndexFromScroll, 140)
    }

    node.addEventListener('scroll', onScroll, { passive: true })
    node.addEventListener('scrollend', updateActiveIndexFromScroll)
    return () => {
      node.removeEventListener('scroll', onScroll)
      node.removeEventListener('scrollend', updateActiveIndexFromScroll)
      if (galleryScrollSettleTimerRef.current) {
        window.clearTimeout(galleryScrollSettleTimerRef.current)
        galleryScrollSettleTimerRef.current = 0
      }
    }
  }, [galleryItems.length])

  useEffect(() => {
    const rail = thumbnailRailRef.current
    if (!rail) return undefined

    const updateLoopMode = () => {
      const gap = Number.parseFloat(window.getComputedStyle(rail).columnGap) || 0
      const thumbnailStep = 54 + gap
      const visibleCount = thumbnailStep > 0
        ? Math.max(1, Math.floor((rail.clientWidth + gap) / thumbnailStep))
        : 1
      const shouldLoop = galleryItems.length > 1 && galleryItems.length > visibleCount
      setThumbnailLoopEnabled(current => current === shouldLoop ? current : shouldLoop)
    }

    updateLoopMode()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLoopMode)
      return () => window.removeEventListener('resize', updateLoopMode)
    }

    const observer = new ResizeObserver(updateLoopMode)
    observer.observe(rail)
    return () => observer.disconnect()
  }, [galleryItems.length])

  useEffect(() => {
    const rail = thumbnailRailRef.current
    if (!rail || !thumbnailLoopEnabled) return undefined
    let settleTimer = 0

    function getCopyStart(copyIndex) {
      const firstThumbnail = rail.querySelector(
        `.product-detail-thumbnail[data-thumbnail-copy="${copyIndex}"][data-gallery-index="0"]`
      )
      if (!firstThumbnail) return null

      const railRect = rail.getBoundingClientRect()
      const thumbnailRect = firstThumbnail.getBoundingClientRect()
      return rail.scrollLeft + thumbnailRect.left - railRect.left
    }

    function recenterThumbnailRail() {
      const centerCopyStart = getCopyStart(1)
      const nextCopyStart = getCopyStart(2)
      if (centerCopyStart === null || nextCopyStart === null) return

      const copyWidth = nextCopyStart - centerCopyStart
      if (copyWidth <= 0) return

      let nextScrollLeft = rail.scrollLeft
      if (nextScrollLeft < centerCopyStart) {
        nextScrollLeft += copyWidth
      } else if (nextScrollLeft >= nextCopyStart) {
        nextScrollLeft -= copyWidth
      }
      const scrollAdjustment = nextScrollLeft - rail.scrollLeft
      if (!scrollAdjustment) return

      const previousScrollBehavior = rail.style.scrollBehavior
      rail.style.scrollBehavior = 'auto'
      rail.scrollLeft += scrollAdjustment
      rail.style.scrollBehavior = previousScrollBehavior
    }

    function onThumbnailRailScroll() {
      if (settleTimer) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(recenterThumbnailRail, 140)
    }

    function onThumbnailRailScrollEnd() {
      if (settleTimer) window.clearTimeout(settleTimer)
      settleTimer = 0
      recenterThumbnailRail()
    }

    rail.addEventListener('scroll', onThumbnailRailScroll, { passive: true })
    rail.addEventListener('scrollend', onThumbnailRailScrollEnd)
    return () => {
      rail.removeEventListener('scroll', onThumbnailRailScroll)
      rail.removeEventListener('scrollend', onThumbnailRailScrollEnd)
      if (settleTimer) window.clearTimeout(settleTimer)
    }
  }, [galleryItems.length, thumbnailLoopEnabled])

  useEffect(() => {
    thumbnailRailInitializedRef.current = false
  }, [galleryItems.length, thumbnailLoopEnabled])

  useEffect(() => {
    const rail = thumbnailRailRef.current
    if (!rail) return undefined

    if (!thumbnailRailInitializedRef.current && thumbnailLoopEnabled) {
      const centerCopyStart = rail.querySelector(
        '.product-detail-thumbnail[data-thumbnail-copy="1"][data-gallery-index="0"]'
      )
      if (centerCopyStart) {
        const previousScrollBehavior = rail.style.scrollBehavior
        rail.style.scrollBehavior = 'auto'
        const railRect = rail.getBoundingClientRect()
        rail.scrollLeft = centerCopyStart.getBoundingClientRect().left - railRect.left + rail.scrollLeft
        rail.style.scrollBehavior = previousScrollBehavior
      }
      thumbnailRailInitializedRef.current = true
    }

    const thumbnails = Array.from(rail.querySelectorAll('.product-detail-thumbnail'))
      .filter(thumbnail => Number(thumbnail.dataset.galleryIndex) === activeIndex)
    if (thumbnails.length === 0) return undefined

    const railCenter = rail.getBoundingClientRect().left + rail.clientWidth / 2
    const activeThumbnail = thumbnails.reduce((closest, thumbnail) => {
      const bounds = thumbnail.getBoundingClientRect()
      const distance = Math.abs(bounds.left + bounds.width / 2 - railCenter)
      if (!closest || distance < closest.distance) return { element: thumbnail, distance }
      return closest
    }, null)?.element
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    activeThumbnail?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest'
    })
    return undefined
  }, [activeIndex, galleryItems.length, thumbnailLoopEnabled])

  useEffect(() => {
    if (requestedSku) return
    const activeImage = galleryItems[activeIndex]?.src
    if (!activeImage) return

    const matchedVariantIndex = variants.findIndex(variant => toImageUrl(variant.image) === activeImage)
    if (matchedVariantIndex >= 0) {
      setSelectedVariantIdx(matchedVariantIndex)
      return
    }

    const fallbackVariantIndex = variantToGalleryIndex.findIndex(index => index === activeIndex)
    if (fallbackVariantIndex >= 0) setSelectedVariantIdx(fallbackVariantIndex)
  }, [activeIndex, galleryItems, variantToGalleryIndex, variants])

  useEffect(() => {
    if (!showDetails) return undefined

    function handleOutside(event) {
      if (!detailsRef.current) return
      if (!detailsRef.current.contains(event.target)) setShowDetails(false)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [showDetails])

  function addCurrentVariantToCart() {
    const variant = variants[selectedVariantIdx] || defaultVariant
    const cartPricing = buildCartPricingData(product, variant)
    const stock = Number(variant?.stock || 0)
    if (stock <= 0) {
      setOutOfStockNotice(variant)
      return false
    }

    addItem({
      productId: product._id,
      sku: variant?.sku || '',
      title: product.title,
      variantLabel: getVariantLabel(variant),
      price: cartPricing.price,
      originalPrice: cartPricing.originalPrice,
      promo: cartPricing.promo,
      stock,
      image: variant?.image || (product.images && product.images[0]) || ''
    }, { incrementIfExists: false })
    return true
  }

  function onBuyCart(event) {
    if (!product) return
    if (addCurrentVariantToCart()) {
      navigate('/cart', {
        state: {
          transitionType: 'cart-portal',
          transitionOrigin: getCenterPointFromEvent(event)
        }
      })
    }
  }

  async function submitComment(event) {
    event.preventDefault()
    const text = commentText.trim()
    const customerUserId = currentUser?._id || currentUser?.id
    if (!text || !customerUserId || !currentUser?.password || commentSending) return
    setCommentSending(true)
    try {
      const response = await axios.post('/api/product-comments', {
        productId: product._id,
        variantSku: currentVariant?.sku || '',
        text,
        customerUserId,
        password: currentUser.password
      })
      setComments(current => [...current, response.data])
      setCommentText('')
    } catch (err) {
      alert(err.response?.data?.error || 'Could not post your comment.')
    } finally {
      setCommentSending(false)
    }
  }

  async function submitCustomerReply(event, commentId) {
    event.preventDefault()
    const text = String(replyDrafts[commentId] || '').trim()
    const customerUserId = currentUser?._id || currentUser?.id
    if (!text || !customerUserId || !currentUser?.password || sendingReplyToId) return

    setSendingReplyToId(commentId)
    try {
      const response = await axios.post(`/api/product-comments/${commentId}/customer-replies`, {
        customerUserId,
        password: currentUser.password,
        text
      })
      setComments(current => [...current, response.data])
      setReplyDrafts(current => ({ ...current, [commentId]: '' }))
      setReplyingToCommentId('')
    } catch (err) {
      alert(err.response?.data?.error || 'Could not post your reply.')
    } finally {
      setSendingReplyToId('')
    }
  }

  function onTryOnBuyCart(event) {
    if (!product) return
    const variant = variants[selectedVariantIdx] || defaultVariant
    const cartPricing = buildCartPricingData(product, variant)
    addItem({
      productId: product._id,
      title: product.title,
      sku: variant?.sku || '',
      variantLabel: getVariantLabel(variant),
      price: cartPricing.price,
      originalPrice: cartPricing.originalPrice,
      promo: cartPricing.promo,
      stock: Number(variant?.stock || 0),
      image: variant?.image || (product.images && product.images[0]) || ''
    }, { incrementIfExists: false })
    navigate('/cart', {
      state: {
        transitionType: 'cart-portal',
        transitionOrigin: getCenterPointFromEvent(event)
      }
    })
  }

  function uploadTryOnPhoto(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setTryOnError('Please choose an image file.')
      return
    }

    setTryOnError('')
    resizeImageFileToDataUrl(file)
      .then(dataUrl => {
        setUploadedPhoto(dataUrl)
        setGeneratedPhoto('')
      })
      .catch(() => {
        setTryOnError('Could not load this photo. Please try another image.')
      })
  }

  function onUploadPhoto(event) {
    uploadTryOnPhoto(event.target.files && event.target.files[0])
    event.target.value = ''
  }

  function onTryOnPhotoDrop(event) {
    event.preventDefault()
    if (tryOnLoading) return
    uploadTryOnPhoto(event.dataTransfer.files && event.dataTransfer.files[0])
  }

  async function generateTryOnPreview() {
    if (!uploadedPhoto || tryOnLoading) return
    setTryOnLoading(true)
    setTryOnError('')
    setGeneratedPhoto('')

    try {
      const garmentSrc = toImageUrl(currentVariant?.image) || galleryItems[activeIndex]?.src || toImageUrl(product?.images?.[0])
      if (!garmentSrc) throw new Error('No product image is available for try-on')
      const garmentImage = await toDataUrlFromImageUrl(garmentSrc)

      const response = await axios.post('/api/products/virtual-tryon', {
        model: 'P-Image-Try-On',
        userImage: uploadedPhoto,
        garmentImage
      })

      const generated = response.data?.image
      if (!generated) throw new Error('No image was generated')
      setGeneratedPhoto(generated)
    } catch (err) {
      setTryOnError(err.response?.data?.error || err.message || 'Try-on generation failed. Please try again.')
    } finally {
      setTryOnLoading(false)
    }
  }

  function closeTryOnModal() {
    if (tryOnLoading) return
    setTryOnOpen(false)
    setUploadedPhoto('')
    setGeneratedPhoto('')
    setTryOnError('')
  }

  function openTryOnModal() {
    setTryOnOpen(true)
    setTryOnError('')
  }

  function downloadGeneratedPhoto() {
    if (!generatedPhoto) return
    const anchor = document.createElement('a')
    anchor.href = generatedPhoto
    anchor.download = `${(product?.title || 'product').replace(/\s+/g, '-').toLowerCase()}-tryon.png`
    anchor.click()
  }

  function scrollToGalleryIndex(index) {
    const node = galleryRef.current
    if (!node) return
    const width = node.clientWidth || 0
    node.scrollTo({ left: width * index, behavior: 'smooth' })
    setActiveIndex(index)
  }

  function scrollPrev() {
    if (galleryItems.length <= 1) return
    const prev = Math.max(0, activeIndex - 1)
    scrollToGalleryIndex(prev)
  }

  function scrollNext() {
    if (galleryItems.length <= 1) return
    const next = Math.min(galleryItems.length - 1, activeIndex + 1)
    scrollToGalleryIndex(next)
  }

  function handleVariantRowSelect(index) {
    if (index === selectedVariantIdx) return
    setSelectedVariantIdx(index)
    const galleryIndex = variantToGalleryIndex[index] ?? 0
    scrollToGalleryIndex(galleryIndex)
  }

  const currentVariant = variants[selectedVariantIdx] || defaultVariant
  const currentPromo = getPromoDetails(product || {}, currentVariant)
  const currentPrice = currentPromo.hasDiscount ? currentPromo.discountedPrice : Number(currentVariant?.price || 0)
  const currentStock = Number(currentVariant?.stock || 0)
  const topLevelComments = comments
    .filter(comment => !comment.parentCommentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const latestComment = topLevelComments[0]
  const promotion = product?.promotion || {}
  const hasPromo = currentPromo.isActive && currentPromo.hasDiscount
  let promotionStatus = ''

  if (hasPromo) {
    if (promotion.limitType === 'time') {
      const end = new Date(promotion.endDate).getTime()
      promotionStatus = Number.isFinite(end) ? `Ends in ${formatPromotionCountdown(end - now)}` : 'Limited time offer'
    } else if (promotion.limitType === 'quantity') {
      const limitCount = Math.max(0, Number(promotion.limitCount || 0))
      const soldCount = Math.max(0, Number(promotion.soldCount || 0))
      promotionStatus = limitCount > 0 ? `Limit left: ${Math.max(0, limitCount - soldCount)}` : `Stock: ${currentStock}`
    } else {
      promotionStatus = 'Hot promotion'
    }
  }

  useEffect(() => {
    if (!hasPromo || promotion.limitType !== 'time') return undefined
    const end = new Date(promotion.endDate).getTime()
    if (!Number.isFinite(end)) return undefined

    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [hasPromo, promotion.endDate, promotion.limitType])

  if (loading) {
    return (
      <div className="shop-page shop-detail-page">
        <p style={{ color: 'var(--text-muted)' }}>Loading product details...</p>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="shop-page shop-detail-page">
        <p style={{ color: 'var(--color-danger)' }}>{error || 'Product not found'}</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 10 }}>Back to Shop</Link>
      </div>
    )
  }

  return (
    <>
      {sharedProductLayoutId && (
        <motion.div
          aria-hidden="true"
          className="product-detail-page-backdrop"
          animate={{ opacity: isExiting ? 0 : 1 }}
          transition={{ duration: PRODUCT_EXIT_DURATION / 1000, ease: 'easeOut' }}
        />
      )}
      <motion.div
        className={`shop-page shop-detail-page${sharedProductLayoutId ? ' product-detail-shared-transition' : ''}`}
        layoutId={sharedProductLayoutId}
        transition={{ layout: { type: 'tween', duration: 0.34, ease: [0.22, 1, 0.36, 1] } }}
      >
      <div className="product-detail-gallery-wrap">
        <div className="product-detail-gallery" ref={galleryRef}>
          {galleryItems.map((item, idx) => (
            <div className="product-detail-slide" key={`${item.kind}-${item.src || 'fallback'}-${idx}`}>
              {item.kind === 'video' ? (
                idx === activeIndex && activeVideoUrl ? (
                  <div
                    className="product-detail-video-frame"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={event => event.stopPropagation()}
                  >
                    <iframe
                      src={activeVideoUrl}
                      title={`${product.title} YouTube video`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      style={{ pointerEvents: 'auto' }}
                    />
                  </div>
                ) : null
              ) : item.src ? (
                <motion.img
                  src={item.src}
                  alt={product.title}
                  layoutId={sharedProductLayoutId && idx === 0 ? `product-image-${String(id)}` : undefined}
                  animate={sharedProductLayoutId
                    ? { opacity: 1 }
                    : { scale: isExiting ? 0.1 : 1, rotate: isExiting ? 180 : 0, opacity: isExiting ? 0 : 1 }}
                  style={{ transformOrigin: 'center center' }}
                  transition={{
                    layout: { type: 'tween', duration: 0.34, ease: [0.22, 1, 0.36, 1] },
                    scale: { duration: PRODUCT_EXIT_DURATION / 1000, ease: 'easeIn' },
                    rotate: { duration: PRODUCT_EXIT_DURATION / 1000, ease: 'easeIn' },
                    opacity: { duration: PRODUCT_EXIT_DURATION / 1000 }
                  }}
                />
              ) : <div className="product-detail-no-image">No Image</div>}
            </div>
          ))}
        </div>

        {galleryItems.length > 1 && galleryItems[activeIndex]?.kind !== 'video' && (
          <>
            <button type="button" className="gallery-arrow gallery-arrow-left" onClick={scrollPrev} aria-label="Previous photo">◀</button>
            <button type="button" className="gallery-arrow gallery-arrow-right" onClick={scrollNext} aria-label="Next photo">▶</button>
          </>
        )}
      </div>

      <motion.div
        className="product-detail-pagination"
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={{ duration: 0.1 }}
      >
        <div
          className="product-detail-thumbnails"
          ref={thumbnailRailRef}
          role="group"
          aria-label="Product images and video"
        >
          {(thumbnailLoopEnabled ? [0, 1, 2] : [1]).flatMap(copyIndex =>
            galleryItems.map((item, idx) => (
              <button
                type="button"
                key={`${copyIndex}-${item.kind}-${item.src || 'fallback'}-${idx}`}
                className={`product-detail-thumbnail ${idx === activeIndex ? 'active' : ''}`}
                data-thumbnail-copy={copyIndex}
                data-gallery-index={idx}
                aria-label={`Go to ${item.kind === 'video' ? 'video' : `photo ${idx + 1}`}`}
                aria-pressed={idx === activeIndex}
                onClick={() => scrollToGalleryIndex(idx)}
              >
                {item.kind === 'video' ? (
                  <span className="product-detail-video-thumbnail" aria-hidden="true">
                    <Play size={18} fill="currentColor" />
                  </span>
                ) : item.src ? (
                  <img src={item.src} alt="" loading="lazy" />
                ) : (
                  <span className="product-detail-empty-thumbnail" aria-hidden="true">No image</span>
                )}
              </button>
            ))
          )}
        </div>
        <span className="product-detail-page-count">{activeIndex + 1}/{galleryItems.length}</span>
      </motion.div>

      <motion.div
        className="product-detail-header-main"
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={{ duration: 0.1 }}
      >
        <div>
          <motion.h1
            className="product-detail-title"
            animate={{ opacity: isExiting ? 0 : 1 }}
            transition={{ duration: 0.1 }}
          >
            {product.title}
          </motion.h1>
          <div className="product-detail-variation-summary" aria-label="Selected variation">
            <span><span className="product-detail-variation-label">Color</span><strong>{normalizeColor(currentVariant) || 'Default'}</strong></span>
            <span className="product-detail-variation-divider" aria-hidden="true">|</span>
            <span><span className="product-detail-variation-label">Size</span><strong>{normalizeSize(currentVariant) || '—'}</strong></span>
          </div>
          {hasPromo && (
            <div className="product-detail-promo-strip">
              <span className="product-detail-promo-title">{currentPromo.title || 'Hot Promotion'}</span>
              <span className="product-detail-promo-badge">-{currentPromo.discountPercentage}%</span>
              <span className="product-detail-promo-original">{Number(currentVariant?.price || 0).toLocaleString()} Ks</span>
              <span className="product-detail-promo-new">{Number(currentPromo.discountedPrice || 0).toLocaleString()} Ks</span>
              <span className="product-detail-promo-status">{promotionStatus}</span>
            </div>
          )}
          <motion.p
            className="product-detail-price"
            animate={{ opacity: isExiting ? 0 : 1 }}
            transition={{ duration: 0.1 }}
          >
            {Number(currentPrice || 0).toLocaleString()} Ks
          </motion.p>
        </div>
        <div className="product-detail-header-actions" ref={detailsRef}>
          <button type="button" className="product-detail-details-toggle" onClick={() => setShowDetails(value => !value)}>
            Details
          </button>
          {showDetails && (
            <div className="product-detail-details-popup">
              <h3>Description / Details</h3>
              <p>{product.description || 'No description provided for this product.'}</p>
            </div>
          )}
        </div>
      </motion.div>

      <motion.section
        className="product-detail-info-panel"
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={{ duration: 0.1 }}
      >
        <div className="product-detail-selected-meta">
          <span className="product-detail-sku-code">{currentVariant?.sku || 'N/A'}</span>
          <span><strong>Selected:</strong> {getVariantLabel(currentVariant)}</span>
          <span className={currentStock > 0 ? 'in-stock' : 'out-stock'}>
            <strong>Stock:</strong> {currentStock > 0 ? `${currentStock} pcs` : 'Out of stock'}
          </span>
        </div>

        <div className="product-detail-variant-scroll-box">
              {displayVariants.map(({ variant, index }) => {
            const variantPromo = getPromoDetails(product, variant)
            const variantPrice = variantPromo.hasDiscount ? variantPromo.discountedPrice : Number(variant.price || 0)
            const isSelected = index === selectedVariantIdx
            const colorName = normalizeColor(variant) || 'Default'
            const sizeName = normalizeSize(variant) || '-'

            return (
              <button
                type="button"
                key={variant.sku || `${variantPrice}-${index}`}
                className={`product-detail-variant-row ${isSelected ? 'selected' : ''}`}
                onClick={() => handleVariantRowSelect(index)}
              >
                <span className="variant-row-color">
                  <span className="variant-row-dot" style={{ backgroundColor: colorName }} />
                  <span>{colorName}</span>
                </span>
                <span className="variant-row-size">{sizeName}</span>
                <span className="variant-row-price">{Number(variantPrice || 0).toLocaleString()} Ks</span>
                <span className={`variant-row-stock ${Number(variant.stock || 0) > 0 ? 'in' : 'out'}`}>
                  {Number(variant.stock || 0)} pcs
                </span>
              </button>
            )
          })}
        </div>
      </motion.section>

      <motion.div
        className={`product-detail-actions product-detail-actions-${product.virtualTryOnEnabled !== false ? 'three' : 'two'}`}
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={{ duration: 0.1 }}
      >
        <motion.button
          type="button"
          className="btn btn-primary product-detail-buy-btn"
          onClick={onBuyCart}
          animate={{ opacity: isExiting ? 0 : 1 }}
          transition={{ duration: 0.1 }}
        >
          <ShoppingCart size={16} /> Buy / Cart
        </motion.button>
        <motion.button
          type="button"
          className="btn btn-secondary product-detail-comment-btn"
          onClick={() => setCommentsOpen(true)}
          animate={{ opacity: isExiting ? 0 : 1 }}
          transition={{ duration: 0.1 }}
        >
          <MessageCircle size={16} /> Comment
        </motion.button>
        {product.virtualTryOnEnabled !== false &&
        <motion.button
          type="button"
          className="btn product-detail-tryon-btn"
          onClick={openTryOnModal}
          animate={{ opacity: isExiting ? 0 : 1 }}
          transition={{ duration: 0.1 }}
        >
          <Sparkles size={15} /> AI Photo
        </motion.button>
        }
      </motion.div>

      {latestComment && <motion.button type="button" className="product-latest-comment" onClick={() => setCommentsOpen(true)} animate={{ opacity: isExiting ? 0 : 1 }} transition={{ duration: 0.1 }}><MessageCircle size={13} /><span><strong>{latestComment.authorName}:</strong> {latestComment.text}</span></motion.button>}

      <AnimatePresence>
        {tryOnOpen && <motion.div
          className="product-stock-modal-backdrop product-detail-tryon-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="AI virtual try-on"
          onClick={closeTryOnModal}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
        >
        <motion.section
          className={`product-detail-tryon-modal${generatedPhoto ? ' has-result' : ''}`}
          onClick={event => event.stopPropagation()}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="product-detail-tryon-head">
            <div>
              <span className="product-detail-tryon-eyebrow"><Sparkles size={13} /> AI STYLING STUDIO</span>
              <h3>Virtual Try-On</h3>
            </div>
            <button type="button" onClick={closeTryOnModal} disabled={tryOnLoading} aria-label="Close try-on"><X size={18} /></button>
          </div>

          {generatedPhoto ? (
            <div className="product-detail-tryon-result">
              <img src={generatedPhoto} alt={`Virtual try-on preview for ${product?.title || 'this product'}`} className="product-detail-generated-image" />
              <div className="product-detail-generated-actions">
                <button type="button" className="btn btn-secondary" onClick={downloadGeneratedPhoto}>
                  <Download size={15} /> Download
                </button>
                <button type="button" className="btn btn-primary" onClick={event => onTryOnBuyCart(event)}>
                  <ShoppingCart size={15} /> Buy / Cart
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeTryOnModal}>Close</button>
              </div>
            </div>
          ) : (
            <div className="product-detail-tryon-panel">
              <input ref={tryOnFileInputRef} className="product-detail-tryon-file-input" type="file" accept="image/*" onChange={onUploadPhoto} disabled={tryOnLoading} />
              <button
                type="button"
                className={`product-detail-tryon-upload-card${uploadedPhoto ? ' is-ready' : ''}`}
                onClick={() => !tryOnLoading && tryOnFileInputRef.current?.click()}
                onDragOver={event => event.preventDefault()}
                onDrop={onTryOnPhotoDrop}
                disabled={tryOnLoading}
              >
                {uploadedPhoto ? (
                  <>
                    <span className="product-detail-tryon-upload-preview"><img src={uploadedPhoto} alt="" /></span>
                    <strong>Photo ready for styling</strong>
                    <span>Tap to choose a different photo</span>
                  </>
                ) : (
                  <>
                    <span className="product-detail-tryon-upload-icon"><Camera size={32} strokeWidth={1.7} /></span>
                    <strong>Tap to upload your photo</strong>
                    <span>Drag and drop or choose a clear, full-body photo</span>
                  </>
                )}
              </button>

              {tryOnLoading ? (
                <div className="product-detail-tryon-processing" role="status" aria-live="polite">
                  <div className="product-detail-tryon-orbit"><WandSparkles size={24} /></div>
                  <strong>{tryOnProcessingMessage}</strong>
                  <span>Your private preview is being created.</span>
                  <div className="product-detail-tryon-progress"><i /></div>
                </div>
              ) : (
                <button type="button" className="btn btn-primary product-detail-tryon-generate" onClick={generateTryOnPreview} disabled={!uploadedPhoto}>
                  <Sparkles size={16} /> Generate Preview
                </button>
              )}

              {tryOnError && <p className="product-detail-tryon-error">{tryOnError}</p>}
              <button type="button" className="btn btn-secondary product-detail-tryon-close" onClick={closeTryOnModal}>Close</button>
            </div>
          )}
        </motion.section>
      </motion.div>}
      </AnimatePresence>

      {outOfStockNotice && <div className="product-stock-modal-backdrop" role="alertdialog" aria-modal="true"><div className="product-stock-modal"><button type="button" onClick={() => setOutOfStockNotice(null)} aria-label="Close"><X size={18} /></button>{toImageUrl(outOfStockNotice.image) && <img src={toImageUrl(outOfStockNotice.image)} alt="" />}<h3>That variant is out of stock</h3><p><strong>{normalizeColor(outOfStockNotice) || 'Default colour'}</strong> · {normalizeSize(outOfStockNotice) || 'Default size'} is currently unavailable. Please choose another colour or size.</p><button type="button" className="btn btn-primary btn-block" onClick={() => setOutOfStockNotice(null)}>Choose another variant</button></div></div>}

      {commentsOpen && createPortal(
        <AnimatePresence initial>
          <motion.div className="product-comments-drawer-backdrop">
            <motion.div
              className="product-comments-drawer-scrim"
              aria-hidden="true"
              onClick={() => setCommentsOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: COMMENT_SHEET_TRANSITION }}
              exit={{ opacity: 0, transition: COMMENT_SHEET_TRANSITION }}
            />
            <motion.section
              className="product-comments-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Comments & Questions"
              initial={{ y: '100%', opacity: 0 }}
              animate={{
                y: 0,
                opacity: 1,
                transition: COMMENT_SHEET_TRANSITION
              }}
              exit={{
                y: '100%',
                opacity: 0,
                transition: COMMENT_SHEET_TRANSITION
              }}
            >
              <div className="product-comments-drawer-head">
                <div>
                  <strong>Comments &amp; Questions</strong>
                  <small>{topLevelComments.length} customer conversations</small>
                </div>
                <button type="button" onClick={() => setCommentsOpen(false)} aria-label="Close comments">
                  <X size={18} />
                </button>
              </div>
              <div className="product-comments-list">
                {topLevelComments.map(comment => {
                  const threadReplies = comments
                    .filter(reply => String(reply.parentCommentId) === String(comment._id))
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  const productContext = comment.productContext || {}
                  const populatedProduct = comment.productId && typeof comment.productId === 'object' ? comment.productId : null
                  const commentVariant = populatedProduct?.variants?.find(variant => variant.sku === productContext.sku)
                  const color = productContext.color || normalizeColor(commentVariant)
                  const size = productContext.size || normalizeSize(commentVariant)
                  const variantDetails = [color, size].filter(Boolean).join(' / ') ||
                    productContext.sku || commentVariant?.sku ||
                    (productContext.price ? `${Number(productContext.price).toLocaleString()} Ks` : '')
                  const isExpanded = Boolean(expandedCommentReplies[comment._id])
                  const visibleReplies = isExpanded ? [...threadReplies].reverse() : threadReplies.slice(0, 1)
                  const hiddenReplyCount = Math.max(0, threadReplies.length - visibleReplies.length)

                  return (
                    <div key={comment._id} className={`product-comment ${highlightedCommentId === String(comment._id) ? 'is-notification-target' : ''}`} data-comment-id={comment._id}>
                      <div className="product-comment-line">
                        <div className="product-comment-author">
                          <strong>{comment.authorName}</strong>
                          {variantDetails && <span className="product-comment-variant" title="Product option selected when this question was posted">{variantDetails}</span>}
                        </div>
                        <p>{comment.text}</p>
                      </div>
                      {visibleReplies.map(reply => (
                        <div key={reply._id} className={`product-comment-reply ${reply.isAdmin ? 'admin' : 'customer'} ${highlightedCommentId === String(reply._id) ? 'is-notification-target' : ''}`} data-comment-id={reply._id}>
                          <strong>{reply.authorName || (reply.isAdmin ? 'Win & Chit Support' : 'Customer')}</strong>
                          <p>{reply.text}</p>
                        </div>
                      ))}
                      <div className="product-comment-actions">
                        {(currentUser?._id || currentUser?.id) && currentUser?.password ? (
                          replyingToCommentId === String(comment._id) ? (
                            <form className="product-comment-reply-form" onSubmit={event => submitCustomerReply(event, String(comment._id))}>
                              <input
                                ref={replyInputRef}
                                className="form-input"
                                value={replyDrafts[comment._id] || ''}
                                onChange={event => setReplyDrafts(current => ({ ...current, [comment._id]: event.target.value }))}
                                placeholder={`Reply as ${currentUser.name || 'Customer'}...`}
                                maxLength={1000}
                              />
                              <button type="submit" className="btn btn-primary" disabled={!String(replyDrafts[comment._id] || '').trim() || sendingReplyToId === String(comment._id)} aria-label="Post reply">
                                <Send size={15} />
                              </button>
                              <button type="button" className="btn btn-secondary" onClick={() => setReplyingToCommentId('')} aria-label="Cancel reply">
                                <X size={15} />
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              className="product-comment-action"
                              onClick={() => setReplyingToCommentId(String(comment._id))}
                            >
                              <MessageCircle size={13} /> Reply
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className="product-comment-action"
                            onClick={() => {
                              const returnUrl = new URL(`${location.pathname}${location.search}`, window.location.origin)
                              returnUrl.searchParams.set('replyTo', String(comment._id))
                              navigate('/account?mode=login', { state: { returnTo: `${returnUrl.pathname}${returnUrl.search}` } })
                            }}
                          >
                            <MessageCircle size={13} /> Log in to reply
                          </button>
                        )}
                        {threadReplies.length > 1 && (
                          <button
                            type="button"
                            className="product-comment-action"
                            onClick={() => setExpandedCommentReplies(current => ({ ...current, [comment._id]: !isExpanded }))}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {isExpanded ? 'See less' : `See more replies (${hiddenReplyCount})`}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {comments.length === 0 && <p className="product-comments-empty">Ask about colours, sizes, or delivery.</p>}
              </div>
              {currentUser?.password && (currentUser?._id || currentUser?.id) ? (
                <form className="product-comment-form" onSubmit={submitComment}>
                  <input
                    ref={commentInputRef}
                    className="form-input"
                    value={commentText}
                    onChange={event => setCommentText(event.target.value)}
                    placeholder="Leave a comment or question..."
                    maxLength={1000}
                  />
                  <button type="submit" className="btn btn-primary" disabled={!commentText.trim() || commentSending} aria-label="Post comment">
                    <Send size={16} />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => {
                    const returnUrl = new URL(`${location.pathname}${location.search}`, window.location.origin)
                    returnUrl.searchParams.set('comment', '1')
                    navigate('/account?mode=login', { state: { returnTo: `${returnUrl.pathname}${returnUrl.search}` } })
                  }}
                >
                  Log in to comment
                </button>
              )}
            </motion.section>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      </motion.div>
    </>
  )
}
