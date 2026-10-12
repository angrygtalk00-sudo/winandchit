import React, { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { toLocalISOString, getDefaultPromoTimes, isPromoActive } from '../utils/promo'
import { notifyProductUpdated, PRODUCT_UPDATED_EVENT, PRODUCT_UPDATED_STORAGE_KEY } from '../utils/productUpdates'

function notifyPromotionsChanged() {
  const updatedAt = String(Date.now())
  localStorage.setItem('promotionsUpdatedAt', updatedAt)
  window.dispatchEvent(new CustomEvent('promotions-updated', { detail: updatedAt }))
}

export default function Discounts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoOpenedForQuery, setAutoOpenedForQuery] = useState('')
  const [selected, setSelected] = useState(null)

  const defaultTimes = getDefaultPromoTimes()
  const [form, setForm] = useState({ enabled: false, title: '', discountPercentage: 0, startDate: defaultTimes.start, endDate: defaultTimes.end, minQty: 0, variantSku: '', limitType: 'time', limitCount: 0 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchProducts()
    function refreshAfterProductChange(update) {
      if (update?.deleted && update.productId) {
        const deletedId = String(update.productId)
        setProducts(current => current.filter(product => String(product._id) !== deletedId))
        setSelected(current => String(current?._id || '') === deletedId ? null : current)
      }
      fetchProducts()
    }

    function onProductUpdated(event) {
      refreshAfterProductChange(event.detail)
    }

    function onStorage(event) {
      if (event.key !== PRODUCT_UPDATED_STORAGE_KEY || !event.newValue) return
      try { refreshAfterProductChange(JSON.parse(event.newValue)) } catch (error) {}
    }

    window.addEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PRODUCT_UPDATED_EVENT, onProductUpdated)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Derived filtered list by search query
  const filtered = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase()
    if (!q) return products
    return products.filter(p => {
      if ((p.title || '').toLowerCase().includes(q)) return true
      if ((p.description || '').toLowerCase().includes(q)) return true
      if ((p.category || '').toLowerCase().includes(q)) return true
      if ((p.code || '').toLowerCase().includes(q)) return true
      if ((p._id || '').toLowerCase().includes(q)) return true
      if (p.variants && p.variants.some(v => (v.sku || '').toLowerCase().includes(q) || (v.code||'').toLowerCase().includes(q))) return true
      return false
    })
  }, [products, searchQuery])

  // Auto-open editor when single clear match appears (seamless search->edit)
  useEffect(() => {
    if (searchQuery.trim().length > 2 && filtered.length === 1) {
      const only = filtered[0]
      if (only && autoOpenedForQuery !== searchQuery) {
        openEditor(only)
        setAutoOpenedForQuery(searchQuery)
      }
    } else if (!searchQuery) {
      setAutoOpenedForQuery('')
    }
  }, [filtered, searchQuery])

  const fetchProducts = async () => {
    setLoading(true); setError('')
    try {
      const r = await axios.get('/api/products')
      setProducts(r.data || [])
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load products')
    } finally { setLoading(false) }
  }

  function openEditor(p) {
    setSelected(p)
    const promo = p.promotion || { enabled: false }
    const inferredLimitType = promo.limitType || (promo.limitCount ? 'quantity' : 'time')
    const startVal = promo.startDate ? toLocalISOString(promo.startDate) : (inferredLimitType === 'time' ? defaultTimes.start : '')
    const endVal = promo.endDate ? toLocalISOString(promo.endDate) : (inferredLimitType === 'time' ? defaultTimes.end : '')
    setForm({
      enabled: !!promo.enabled,
      title: promo.title || '',
      discountPercentage: promo.discountPercentage || 0,
      startDate: startVal,
      endDate: endVal,
      minQty: promo.minQty || 0,
      variantSku: promo.variantSku || '',
      limitType: inferredLimitType,
      limitCount: promo.limitCount || 0
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function savePromotion() {
    if (!selected) return
    setSaving(true)
    try {
      const promotionPayload = {
        enabled: Boolean(form.enabled),
        title: form.title || '',
        discountPercentage: Number(form.discountPercentage) || 0,
        startDate: form.limitType === 'time' && form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.limitType === 'time' && form.endDate ? new Date(form.endDate).toISOString() : null,
        limitType: form.limitType || 'time',
        limitCount: form.limitType === 'quantity' ? Number(form.limitCount) || 0 : 0,
        soldCount: selected.promotion?.soldCount || 0,
        minQty: Number(form.minQty) || 0,
        variantSku: form.variantSku || ''
      }

      const res = await axios.put(`/api/products/${selected._id}`, { promotion: promotionPayload })
      const updatedProduct = res.data || { ...selected, promotion: promotionPayload }

      // Update state immediately with server-persisted product
      setProducts(prev => prev.map(p => (p._id === selected._id ? updatedProduct : p)))
      notifyProductUpdated(updatedProduct._id)
      // Keep the editor bound to the saved product so the Target Product dropdown
      // does not reset; refresh the form from the server-returned product
      openEditor(updatedProduct)
      notifyPromotionsChanged()
    } catch (err) {
      console.error('Promotion save error:', err)
      alert('Save failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setSaving(false)
    }
  }

  async function clearPromotion(p) {
    if (!confirm('Remove promotion for this product?')) return
    try {
      const res = await axios.put(`/api/products/${p._id}`, {
        promotion: {
          enabled: false,
          discountPercentage: 0,
          title: '',
          startDate: null,
          endDate: null,
          limitType: 'time',
          limitCount: 0,
          soldCount: 0,
          minQty: 0,
          variantSku: ''
        }
      })
      const updated = res.data || null
      if (updated) {
        setProducts(prev => prev.map(item => item._id === updated._id ? updated : item))
        notifyProductUpdated(updated._id)
        if (selected && selected._id === p._id) {
          openEditor(updated)
        }
        notifyPromotionsChanged()
      } else {
        await fetchProducts()
        notifyPromotionsChanged()
      }
    } catch (err) { console.error(err); alert('Failed to clear: ' + (err.response?.data?.error || err.message)) }
  }

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Discounts / Promotions</h1>
          <p className="page-subtitle">Create and manage time-limited or quantity-based promotions</p>
        </div>
        <Link to="/add-product" className="btn btn-secondary">Add Product</Link>
      </div>

      <div className="card">
        <div className="split-layout">
          <div className="split-layout-panel">
            <div style={{ marginBottom: 10, display: 'flex', gap: 8, minWidth: 0 }}>
              <input
                placeholder="Search products by name, SKU, code or details..."
                className="form-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="btn btn-ghost" onClick={() => { setSearchQuery(''); setAutoOpenedForQuery('') }} style={{ flexShrink: 0 }}>Clear</button>
            </div>

            {loading ? (
              <div style={{ padding: 24, textAlign: 'center' }}>Loading products...</div>
            ) : error ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>{error}</div>
            ) : (
              <div style={{ maxHeight: '64vh', overflow: 'auto', borderRadius: 6 }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variants</th>
                      <th style={{ textAlign: 'center' }}>Active</th>
                      <th style={{ textAlign: 'right' }}>Discount</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => {
                      const promo = p.promotion || { enabled: false }
                      const active = isPromoActive(promo)
                      return (
                          <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => openEditor(p)}>
                            <td><strong>{p.title}</strong><div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.category}</div></td>
                            <td>{(p.variants || []).map(v => v.sku).join(', ')}</td>
                            <td style={{ textAlign: 'center' }}>
                              {active ? (
                                <strong style={{ color: 'var(--color-danger, #ef4444)' }}>Yes</strong>
                              ) : promo.enabled ? (
                                <span style={{ color: 'var(--text-warning, #f59e0b)', fontWeight: 700 }}>Expired</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>No</span>
                              )}
                            </td>
                          <td style={{ textAlign: 'right' }}>{promo.discountPercentage ? `${promo.discountPercentage}%` : '-'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); openEditor(p) }}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); clearPromotion(p) }} style={{ marginLeft: 8 }}>Clear</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="split-layout-panel">
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>{selected ? `Edit Promotion — ${selected.title}` : 'Create / Edit Promotion'}</h3>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, minWidth: 0 }}>
                <label style={{ fontSize: '0.9rem', flexShrink: 0 }}>Target Product</label>
                <select className="form-select" style={{ flex: 1, minWidth: 0 }} value={selected?._id || ''} onChange={e => {
                  const id = e.target.value
                  const p = products.find(x => x._id === id)
                  if (p) openEditor(p)
                }}>
                  <option value="">-- Select product --</option>
                  {products.map(p => (<option key={p._id} value={p._id}>{p.title}</option>))}
                </select>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: '0.85rem' }}><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} /> Enable</label>
                <input className="form-input" placeholder="Campaign title" style={{ width: '100%' }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                  <input type="number" min={0} max={100} className="form-input" style={{ flex: 1, minWidth: 0 }} value={form.discountPercentage} onChange={e => setForm(f => ({ ...f, discountPercentage: Number(e.target.value) }))} />
                  <span style={{ alignSelf: 'center' }}>%</span>
                </div>

                {/* Limit type selector: shows either time pickers or quantity limit */}
                <div style={{ display: 'flex', gap: 8, minWidth: 0, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Limit Type</label>
                    <select className="form-select" style={{ width: '100%' }} value={form.limitType} onChange={e => {
                      const v = e.target.value
                      if (v === 'time') {
                        setForm(f => ({ ...f, limitType: v, startDate: f.startDate || defaultTimes.start, endDate: f.endDate || defaultTimes.end }))
                      } else {
                        setForm(f => ({ ...f, limitType: v }))
                      }
                    }}>
                      <option value="time">By Time (Start / End)</option>
                      <option value="quantity">By Quantity (Limit sold)</option>
                    </select>
                  </div>
                </div>

                {form.limitType === 'time' ? (
                  <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Start</label>
                      <input type="datetime-local" className="form-input" style={{ width: '100%' }} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>End</label>
                      <input type="datetime-local" className="form-input" style={{ width: '100%' }} value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ fontSize: '0.75rem' }}>Quantity Limit</label>
                      <input type="number" min={0} className="form-input" style={{ width: '100%' }} value={form.limitCount} onChange={e => setForm(f => ({ ...f, limitCount: Number(e.target.value) }))} />
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 6 }}>Maximum number of items to which this promotion applies (e.g., first 20 sold)</div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Apply to Variant (optional)</label>
                    <select className="form-select" style={{ width: '100%' }} value={form.variantSku} onChange={e => setForm(f => ({ ...f, variantSku: e.target.value }))}>
                      <option value="">All Variants</option>
                      {selected?.variants?.map((v, idx) => (<option key={idx} value={v.sku}>{v.sku}</option>))}
                    </select>
                  </div>
                  <div style={{ width: 100, minWidth: 0, flexShrink: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Min Qty</label>
                    <input type="number" min={0} className="form-input" value={form.minQty} onChange={e => setForm(f => ({ ...f, minQty: Number(e.target.value) }))} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-secondary" onClick={() => {
                    setSelected(null);
                    setForm({ enabled: false, title: '', discountPercentage: 0, startDate: defaultTimes.start, endDate: defaultTimes.end, minQty: 0, variantSku: '', limitType: 'time', limitCount: 0 })
                  }}>Cancel</button>
                  <button className="btn btn-primary" onClick={savePromotion} disabled={saving}>{saving ? 'Saving...' : 'Save Promotion'}</button>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
