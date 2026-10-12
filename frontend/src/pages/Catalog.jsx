import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { SlidersHorizontal, RotateCcw, X, Search, Package2, TriangleAlert, Flame, Percent, Sparkles, Award, ArrowRight } from 'lucide-react'
import { getPromoDetails } from '../utils/promo'
import ProductCard from '../components/ProductCard'
import Banner from '../components/Banner'
import CustomerCommentNotifications from '../components/CustomerCommentNotifications'
import { PRODUCT_UPDATED_EVENT, PRODUCT_UPDATED_STORAGE_KEY } from '../utils/productUpdates'

const QUICK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'hot', label: 'Hot', icon: Flame },
  { id: 'discount', label: 'Discount', icon: Percent },
  { id: 'new', label: 'New', icon: Sparkles }
]

const NEW_ARRIVAL_WINDOW_DAYS = 30
const DEFAULT_FILTERS = { category: '', subCategory: '', minPrice: '', maxPrice: '', discountedOnly: false }
const VIEW_COUNT_STORAGE_KEY = 'catalogProductViews'
const PULL_REFRESH_TRIGGER = 70

function readStoredViewCounts() {
  try {
    const raw = localStorage.getItem(VIEW_COUNT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function writeStoredViewCounts(viewCounts) {
  try {
    localStorage.setItem(VIEW_COUNT_STORAGE_KEY, JSON.stringify(viewCounts))
  } catch {
    // Ignore storage errors and keep app functional.
  }
}

function normalizeSearchText(value) {
  if (value === null || value === undefined) return ''
  return String(value).toLowerCase().trim()
}

function buildProductSearchIndex(product) {
  const variants = product?.variants || []
  const variantText = variants.map(variant => {
    const attributes = variant?.attributes || {}
    const attributePairs = Object.entries(attributes).map(([key, value]) => `${key} ${value}`)
    return [
      variant?.sku,
      variant?.color,
      variant?.size,
      variant?.material,
      variant?.description,
      ...attributePairs
    ].filter(Boolean).join(' ')
  }).join(' ')

  const tags = Array.isArray(product?.tags) ? product.tags.join(' ') : product?.tags

  return normalizeSearchText([
    product?.title,
    product?.description,
    product?.details,
    product?.category,
    product?.subCategory,
    tags,
    variantText
  ].filter(Boolean).join(' '))
}

export default function Catalog() {
  const PAGE_SIZE = 20
  const CACHE_KEY = 'catalog_cache_v1'
  const UI_STATE_KEY = 'catalog_ui_v1'
  const SCROLL_KEY = 'catalog_scroll_top'

  // Synchronously hydrate cache and UI state to avoid flashing loading on tab switch
  const _initialCache = (() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || !Array.isArray(parsed.products)) return null
      const age = Date.now() - (parsed.timestamp || 0)
      if (age > 10 * 60 * 1000) return null
      return parsed
    } catch (e) {
      return null
    }
  })()

  const _initialUi = (() => {
    try {
      const raw = sessionStorage.getItem(UI_STATE_KEY)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  })()

  const [products, setProducts] = useState(_initialCache?.products || [])
  const [page, setPage] = useState(_initialCache?.page || 0)
  const [hasMore, setHasMore] = useState(_initialCache ? Boolean(_initialCache.hasMore) : true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState(_initialUi?.search || '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState(_initialUi?.filters || DEFAULT_FILTERS)
  const [quickFilter, setQuickFilter] = useState(_initialUi?.quickFilter || 'all')
  const [loading, setLoading] = useState(!(_initialCache && Array.isArray(_initialCache.products) && _initialCache.products.length > 0))
  const [validatingCache, setValidatingCache] = useState(Boolean(_initialCache?.products?.length))
  const [error, setError] = useState('')
  const [viewCounts, setViewCounts] = useState({})
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const pullStartYRef = useRef(null)
  const scrollSaveFrameRef = useRef(null)
  const savedScrollYRef = useRef(0)
  const restoredScrollRef = useRef(false)
  const pullProgress = Math.min(1, pullDistance / PULL_REFRESH_TRIGGER)
  const sentinelRef = useRef(null)

  function saveCache(productsToSave, pageToSave, nextHasMore) {
    try {
      const payload = { products: productsToSave, page: pageToSave, hasMore: Boolean(nextHasMore), timestamp: Date.now() }
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload))
    } catch {}
  }

  function restoreCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      if (!parsed || !Array.isArray(parsed.products)) return false
      const age = Date.now() - (parsed.timestamp || 0)
      // keep cache for 10 minutes
      if (age > 10 * 60 * 1000) return false
      // If cached product list is empty, treat as no-cache so we fetch from server.
      if (!Array.isArray(parsed.products) || parsed.products.length === 0) return false
      setProducts(parsed.products)
      setPage(parsed.page || 0)
      setHasMore(parsed.hasMore !== false)
      return true
    } catch (e) {
      return false
    }
  }

  async function fetchPage(pageToLoad = 0, { silent = false, preserveLoaded = false } = {}) {
    if (!silent) setError('')
    if (pageToLoad === 0 && !silent) {
      setLoading(true)
    } else if (pageToLoad > 0) {
      setLoadingMore(true)
    }
    try {
      const axiosConfig = {
        timeout: 12000,
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        params: { _ts: Date.now() }
      }
      const res = pageToLoad === 0
        ? await axios.get('/api/products', axiosConfig)
        : await axios.get('/api/products', { ...axiosConfig, params: { ...axiosConfig.params, offset: pageToLoad * PAGE_SIZE, limit: PAGE_SIZE } })

      // Support several response shapes: array, { products: [] }, or { data: [] }
      let items = []
      if (Array.isArray(res.data)) items = res.data
      else if (res.data && Array.isArray(res.data.products)) items = res.data.products
      else if (res.data && Array.isArray(res.data.data)) items = res.data.data
      else items = []
      // If the backend ignores pagination and returns everything, detect and slice
      if (pageToLoad > 0) {
        setProducts(prev => {
          const next = [...prev, ...items]
          saveCache(next, pageToLoad, items.length === PAGE_SIZE)
          setHasMore(items.length === PAGE_SIZE)
          return next
        })
      } else {
        const firstPage = items.length > PAGE_SIZE ? items.slice(0, PAGE_SIZE) : items
        if (preserveLoaded) {
          const firstPageIds = new Set(firstPage.map(product => String(product._id)))
          const cachedIds = [...new Set(products
            .map(product => String(product._id))
            .filter(productId => !firstPageIds.has(productId)))]
          let activeCachedProducts = []
          if (cachedIds.length > 0) {
            try {
              const cachedResponse = await axios.post('/api/products/active-lookup', { ids: cachedIds }, { timeout: 12000 })
              activeCachedProducts = Array.isArray(cachedResponse.data) ? cachedResponse.data : []
            } catch (lookupError) {
              console.warn('Could not validate cached products:', lookupError.message)
            }
          }
          const activeProductsById = new Map(activeCachedProducts.map(product => [String(product._id), product]))
          setProducts(current => {
            const next = [...firstPage]
            const includedIds = new Set(firstPageIds)
            current.forEach(product => {
              const productId = String(product._id)
              const activeProduct = activeProductsById.get(productId)
              if (activeProduct && !includedIds.has(productId)) {
                next.push(activeProduct)
                includedIds.add(productId)
              }
            })
            saveCache(next, page, items.length > PAGE_SIZE)
            return next
          })
          setHasMore(items.length > PAGE_SIZE)
        } else if (items.length > PAGE_SIZE) {
          const firstSlice = items.slice(0, PAGE_SIZE)
          setProducts(firstSlice)
          setHasMore(items.length > PAGE_SIZE)
          saveCache(firstSlice, 0, items.length > PAGE_SIZE)
        } else {
          setProducts(items)
          setHasMore(items.length === PAGE_SIZE)
          saveCache(items, 0, items.length === PAGE_SIZE)
        }
      }
      if (!preserveLoaded) setPage(pageToLoad)
      return true
    } catch (err) {
      console.error('Failed to load products:', err)
      const message = err.response?.data?.error || err.response?.data?.message || (err.code === 'ECONNABORTED' ? 'Connection timed out. Please retry.' : err.message) || 'Failed to fetch products'
      if (!silent) setError(message)
      return false
    } finally {
      if (!silent) setLoading(false)
      if (pageToLoad > 0) setLoadingMore(false)
    }
  }

  useEffect(() => {
    setViewCounts(readStoredViewCounts())
  }, [])

  // Re-render catalog cards immediately when a promotion expiry happens elsewhere (e.g., Cart timer).
  useEffect(() => {
    function onPromotionsUpdated() {
      setProducts(current => [...current])
    }
    window.addEventListener('promotionsUpdated', onPromotionsUpdated)
    return () => window.removeEventListener('promotionsUpdated', onPromotionsUpdated)
  }, [])

  useEffect(() => {
    async function refreshProduct(update) {
      if (!update?.productId) {
        if (update?.created) fetchPage(0)
        return
      }
      if (update.deleted) {
        const deletedId = String(update.productId)
        setProducts(current => {
          const next = current.filter(product => String(product._id) !== deletedId)
          saveCache(next, page, hasMore)
          return next
        })
        fetchPage(0, { silent: true, preserveLoaded: true })
        return
      }
      try {
        const response = await axios.get(`/api/products/${update.productId}`, { timeout: 12000 })
        const updatedProduct = response.data
        const wasCached = products.some(product => String(product._id) === String(update.productId))
        setProducts(current => {
          if (!wasCached) return current
          const next = current.map(product => String(product._id) === String(update.productId) ? updatedProduct : product)
          saveCache(next, page, hasMore)
          return next
        })
        if (!wasCached || update.created) fetchPage(0)
      } catch (error) {
        console.warn('Could not refresh updated product:', error.message)
      }
    }

    const onProductUpdated = event => refreshProduct(event.detail)
    const onProductUpdatedInAnotherTab = event => {
      if (event.key !== PRODUCT_UPDATED_STORAGE_KEY || !event.newValue) return
      try { refreshProduct(JSON.parse(event.newValue)) } catch (error) {}
    }
    window.addEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
    window.addEventListener('storage', onProductUpdatedInAnotherTab)
    return () => {
      window.removeEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
      window.removeEventListener('storage', onProductUpdatedInAnotherTab)
    }
  }, [page, hasMore, products])

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === 'visible') fetchPage(0, { silent: true, preserveLoaded: true })
    }
    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [page, hasMore, products])

  // persist UI state (filters/search/quickFilter) whenever they change
  useEffect(() => {
    try { sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ filters, search, quickFilter })) } catch {}
  }, [filters, search, quickFilter])

  // Keep the latest scroll position available before route cleanup can reset the window.
  useEffect(() => {
    function saveScrollPosition() {
      savedScrollYRef.current = window.scrollY || 0
      if (scrollSaveFrameRef.current !== null) return
      scrollSaveFrameRef.current = window.requestAnimationFrame(() => {
        scrollSaveFrameRef.current = null
        try { sessionStorage.setItem(SCROLL_KEY, String(savedScrollYRef.current)) } catch {}
      })
    }

    window.addEventListener('scroll', saveScrollPosition, { passive: true })
    window.addEventListener('catalogSaveScroll', saveScrollPosition)
    return () => {
      window.removeEventListener('scroll', saveScrollPosition)
      window.removeEventListener('catalogSaveScroll', saveScrollPosition)
      if (scrollSaveFrameRef.current !== null) window.cancelAnimationFrame(scrollSaveFrameRef.current)
      try { sessionStorage.setItem(SCROLL_KEY, String(savedScrollYRef.current)) } catch {}
    }
  }, [])

  // Ensure cache + UI state are saved when the user navigates away or component unmounts.
  useEffect(() => {
    function handleSave() {
      try {
        saveCache(products, page, hasMore)
      } catch {}
      try { sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ filters, search, quickFilter })) } catch {}
    }

    window.addEventListener('pagehide', handleSave)
    window.addEventListener('beforeunload', handleSave)
    return () => { handleSave(); window.removeEventListener('pagehide', handleSave); window.removeEventListener('beforeunload', handleSave) }
  }, [products, page, hasMore, filters, search, quickFilter])

  useEffect(() => {
    const restored = restoreCache()
    fetchPage(0, { silent: restored, preserveLoaded: restored }).then(success => {
      if (restored && !success) {
        setProducts([])
        try { sessionStorage.removeItem(CACHE_KEY) } catch {}
        setError('Could not verify saved products. Please retry.')
      }
      setValidatingCache(false)
    })
  }, [])

  // Restore after cached products have been committed to the DOM, not at an arbitrary timeout.
  useEffect(() => {
    if (restoredScrollRef.current || loading || products.length === 0) return
    const scrollTop = Number(sessionStorage.getItem(SCROLL_KEY) || 0)
    restoredScrollRef.current = true
    if (!Number.isFinite(scrollTop) || scrollTop <= 0) return

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'auto' }))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading, products.length])

  const resolvedViewCounts = useMemo(() => {
    const merged = {}
    for (const product of products) {
      const productCount = Number(product?.viewCount ?? product?.views ?? 0)
      merged[product._id] = Number.isFinite(productCount) && productCount > 0 ? productCount : 0
    }
    for (const [productId, count] of Object.entries(viewCounts || {})) {
      const parsed = Number(count)
      if (Number.isFinite(parsed) && parsed >= 0) merged[productId] = parsed
    }
    return merged
  }, [products, viewCounts])

  // Order Clothing first, then the remaining categories.
  const rawCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))
  rawCategories.sort((a, b) => {
    if (a.toLowerCase() === 'clothing') return -1
    if (b.toLowerCase() === 'clothing') return 1
    return a.localeCompare(b)
  })
  const rawSubCategories = Array.from(new Set(products.map(product => product.subCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const minPrice = filters.minPrice === '' ? null : Number(filters.minPrice)
  const maxPrice = filters.maxPrice === '' ? null : Number(filters.maxPrice)
  const hasPriceFilter = minPrice !== null || maxPrice !== null
  const filtersActive = Boolean(filters.category) || Boolean(filters.subCategory) || filters.minPrice !== '' || filters.maxPrice !== '' || filters.discountedOnly

  function resetFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  function handleQuickFilterClick(id) {
    setQuickFilter(current => (current === id ? 'all' : id))
  }

  async function refreshCatalogWithReset() {
    if (isRefreshing) return
    setIsRefreshing(true)
    setSearch('')
    setQuickFilter('all')
    setFilters(DEFAULT_FILTERS)
    setFiltersOpen(false)

    try {
      // clear cached session then fetch first page
      try { sessionStorage.removeItem(CACHE_KEY); sessionStorage.removeItem(SCROLL_KEY); sessionStorage.removeItem(UI_STATE_KEY) } catch {}
      await fetchPage(0)
      setError('')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch products')
    } finally {
      setIsRefreshing(false)
      setPullDistance(0)
    }
  }

  // Handle Home reselect: smooth scroll to top only (no hard reload)
  useEffect(() => {
    function onHomeReselect() {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch {}
      savedScrollYRef.current = 0
      try { sessionStorage.setItem(SCROLL_KEY, '0') } catch {}
    }
    window.addEventListener('homeReselect', onHomeReselect)
    return () => window.removeEventListener('homeReselect', onHomeReselect)
  }, [])

  function handleTouchStart(event) {
    if (isRefreshing || window.scrollY > 0) return
    pullStartYRef.current = event.touches[0]?.clientY ?? null
  }

  function handleTouchMove(event) {
    if (pullStartYRef.current === null || isRefreshing || window.scrollY > 0) return
    const currentY = event.touches[0]?.clientY
    if (typeof currentY !== 'number') return
    const delta = currentY - pullStartYRef.current
    if (delta <= 0) {
      setPullDistance(0)
      return
    }

    const nextDistance = Math.min(100, delta * 0.45)
    setPullDistance(nextDistance)
    if (event.cancelable) event.preventDefault()
  }

  function handleTouchEnd() {
    const shouldRefresh = pullDistance >= PULL_REFRESH_TRIGGER
    pullStartYRef.current = null
    if (shouldRefresh) {
      setPullDistance(PULL_REFRESH_TRIGGER)
      refreshCatalogWithReset()
      return
    }
    setPullDistance(0)
  }

  function incrementProductView(productId) {
    setViewCounts(current => {
      const baseline = Number.isFinite(Number(current?.[productId]))
        ? Number(current[productId])
        : Number(resolvedViewCounts?.[productId] || 0)
      const next = { ...current, [productId]: Math.max(0, baseline) + 1 }
      writeStoredViewCounts(next)
      return next
    })
  }

  const filteredProducts = products.filter(p => {
    const matchesCategory = !filters.category || filters.category === '' || filters.category === p.category
    const matchesSubCategory = !filters.subCategory || filters.subCategory === '' || filters.subCategory === p.subCategory
    const matchesPrice = !hasPriceFilter || (p.variants || []).some(variant => {
      const price = Number(variant.price)
      return Number.isFinite(price)
        && (minPrice === null || price >= minPrice)
        && (maxPrice === null || price <= maxPrice)
    })
    const matchesDiscount = !filters.discountedOnly || (p.variants || []).some(variant => getPromoDetails(p, variant).hasDiscount)
    const searchTerm = normalizeSearchText(search)
    const searchTokens = searchTerm.split(/\s+/).filter(Boolean)
    const productSearchIndex = buildProductSearchIndex(p)
    const matchesSearch = searchTokens.length === 0
      || searchTokens.every(token => productSearchIndex.includes(token))

    const variantPromos = (p.variants || []).map(variant => getPromoDetails(p, variant))
    const matchesQuickDiscount = quickFilter !== 'discount' || variantPromos.some(promo => promo.isActive && promo.hasDiscount)
    const entryTime = new Date(p.entryDate).getTime()
    const matchesNew = quickFilter !== 'new' || (Number.isFinite(entryTime) && (Date.now() - entryTime) <= NEW_ARRIVAL_WINDOW_DAYS * 86400000)

    return matchesCategory && matchesSubCategory && matchesPrice && matchesDiscount && matchesSearch && matchesQuickDiscount && matchesNew
  })

  const displayedProducts = useMemo(() => {
    if (quickFilter !== 'hot') return filteredProducts
    return [...filteredProducts].sort((a, b) => {
      const bViews = Number(resolvedViewCounts?.[b._id] || 0)
      const aViews = Number(resolvedViewCounts?.[a._id] || 0)
      return bViews - aViews
    })
  }, [filteredProducts, quickFilter, resolvedViewCounts])

  // Infinite scroll: observe sentinel and load next page when visible
  useEffect(() => {
    if (!sentinelRef.current) return undefined
    const obs = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          fetchPage(page + 1)
        }
      }
    }, { root: null, rootMargin: '240px', threshold: 0.1 })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [sentinelRef.current, hasMore, loadingMore, loading, page])

  return (
    <div className="shop-page catalog-page" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="catalog-sticky-header">
        <div className="search-filter-bar">
          <div className="search-input-wrap">
            <span className="search-icon-svg"><Search size={16} strokeWidth={2} /></span>
            <input
              type="text"
              className="form-input"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={`catalog-filter-button ${filtersActive ? 'active' : ''}`}
            onClick={() => setFiltersOpen(true)}
            title="Filter catalog"
            aria-label="Filter catalog"
          >
            <SlidersHorizontal size={19} aria-hidden="true" />
          </button>
        </div>

        <Banner className="sticky" />

        <div className="catalog-category-row">
          <div className="category-pills">
            {QUICK_FILTERS.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={`category-pill ${(id === 'all' ? quickFilter === 'all' : quickFilter === id) ? 'active' : ''}`}
                onClick={() => handleQuickFilterClick(id)}
              >
                {Icon && <Icon size={14} strokeWidth={2.3} />}
                {label}
              </button>
            ))}
          </div>
          <CustomerCommentNotifications />
        </div>
      </div>

      <div
        className={`catalog-pull-refresh ${isRefreshing ? 'refreshing' : pullDistance > 0 ? 'pulling' : ''}`}
        style={{ '--pull-progress': String(pullProgress) }}
        aria-hidden="true"
      >
        <div className="catalog-pull-refresh-spinner" />
      </div>

      {filtersOpen && (
        <div className="catalog-filter-backdrop" onMouseDown={() => setFiltersOpen(false)}>
          <aside className="catalog-filter-drawer" role="dialog" aria-modal="true" aria-label="Catalog filters" onMouseDown={event => event.stopPropagation()}>
            <div className="catalog-filter-drawer-header">
              <div>
                <h2>Filter products</h2>
                <p>{filteredProducts.length} matching product{filteredProducts.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" className="catalog-filter-close" onClick={() => setFiltersOpen(false)} title="Close filters" aria-label="Close filters">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="catalog-filter-section">
              <span className="catalog-filter-label">Category</span>
              <div>
                <select className="catalog-select" value={filters.category || ''} onChange={event => setFilters(current => ({ ...current, category: event.target.value }))}>
                  <option value="">All categories</option>
                  {rawCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>

            {rawSubCategories.length > 0 && (
              <div className="catalog-filter-section">
                <span className="catalog-filter-label">Sub-category</span>
                <div>
                  <select className="catalog-select" value={filters.subCategory || ''} onChange={event => setFilters(current => ({ ...current, subCategory: event.target.value }))}>
                    <option value="">All sub-categories</option>
                    {rawSubCategories.map(subCategory => (
                      <option key={subCategory} value={subCategory}>{subCategory}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="catalog-filter-section">
              <span className="catalog-filter-label">Price range</span>
              <div className="catalog-price-inputs">
                <input type="number" min="0" className="form-input" placeholder="Min price" value={filters.minPrice} onChange={event => setFilters(current => ({ ...current, minPrice: event.target.value }))} />
                <input type="number" min="0" className="form-input" placeholder="Max price" value={filters.maxPrice} onChange={event => setFilters(current => ({ ...current, maxPrice: event.target.value }))} />
              </div>
            </div>

            <label className="catalog-discount-option">
              <input type="checkbox" checked={filters.discountedOnly} onChange={event => setFilters(current => ({ ...current, discountedOnly: event.target.checked }))} />
              <span>Active discounts only</span>
            </label>

            <div className="catalog-filter-actions">
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                <RotateCcw size={16} aria-hidden="true" /> Reset
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>Apply</button>
            </div>
          </aside>
        </div>
      )}

      {error ? (
        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <div style={{ marginBottom: 8, display: 'inline-flex', color: 'var(--color-warning)' }}><TriangleAlert size={28} /></div>
          <h3 style={{ marginBottom: 6 }}>Could not load products</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>{error}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                try {
                  sessionStorage.removeItem(CACHE_KEY)
                  sessionStorage.removeItem(CACHE_PAGE_KEY)
                  sessionStorage.removeItem(CACHE_HAS_MORE_KEY)
                } catch (e) {
                  // ignore
                }
                fetchPage(0)
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : validatingCache || (loading && products.length === 0) ? (
        <div className="catalog-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-img" />
              <div className="skeleton-lines">
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
                <div className="skeleton-line small" />
              </div>
            </div>
          ))}
        </div>
      ) : displayedProducts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ marginBottom: 12, display: 'inline-flex', color: 'var(--text-muted)' }}><Package2 size={40} /></div>
          <h3 style={{ marginBottom: 6 }}>No products found</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            {search || filtersActive || quickFilter !== 'all' ? 'Try adjusting your search or filters.' : 'New arrivals are on their way.'}
          </p>
        </div>
      ) : (
        <div className="catalog-grid">
          {displayedProducts.map(p => (
            <ProductCard
              key={p._id}
              product={p}
              showPromoOverlay
              enableVariantTicker
              viewCount={resolvedViewCounts[p._id] || 0}
              onOpenDetail={incrementProductView}
            />
          ))}
          <div ref={sentinelRef} style={{ width: '100%', height: 1 }} aria-hidden="true" />
          {(loadingMore || (hasMore && !loading && products.length > 0)) && (
            <div className="catalog-load-more">
              <div className="loader-small" />
              <span>Loading more...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
