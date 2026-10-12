import React, { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { openAdminReceipt } from '../utils/adminAuth'
import { RefreshCw, Search, PackageX, ReceiptText, CalendarDays, MapPin, Phone, Bus, Package2, Pencil, Printer, Undo2, Tag, Truck, CheckCircle2, XCircle, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { ColorSwatch } from '../utils/colors'
import { getGlobalDateFilter, setGlobalDateFilter, resetGlobalDateFilterToToday } from '../utils/globalDateFilter'

function DeliveryServicePicker({ services, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const availableServices = services.filter(service => service.enabled !== false)
  const selectedService = availableServices.find(service => service.name === value)
  const legacyService = value && !selectedService ? { name: value, bgColor: '#475569' } : null
  const options = legacyService ? [legacyService, ...availableServices] : availableServices

  const renderService = service => (
    <>
      {service.logoUrl ? <img src={service.logoUrl} alt="" /> : <Truck size={18} aria-hidden="true" />}
      <span>{service.name}</span>
    </>
  )

  return (
    <div className="order-delivery-picker">
      <button
        type="button"
        className="order-delivery-trigger"
        style={selectedService ? { '--delivery-color': selectedService.bgColor || '#1e293b', backgroundColor: selectedService.bgColor || '#1e293b', color: '#fff' } : undefined}
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedService ? renderService(selectedService) : <span>{value || 'Select delivery service'}</span>}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="order-delivery-options" role="listbox" aria-label="Delivery services">
          {options.length ? options.map((service, index) => (
            <button
              type="button"
              role="option"
              aria-selected={service.name === value}
              className="order-delivery-option"
              style={{ '--delivery-color': service.bgColor || '#1e293b' }}
              key={`${service.name}-${index}`}
              onClick={() => { onChange(service.name); setIsOpen(false) }}
            >
              {renderService(service)}
              {service.name === value && <CheckCircle2 size={16} aria-hidden="true" />}
            </button>
          )) : <div className="order-delivery-empty">No active delivery services configured</div>}
        </div>
      )}
    </div>
  )
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [shopSettings, setShopSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('all') // all|local|online|pending|new|packing|shipped|delivered|cancelled
  const [editingOrder, setEditingOrder] = useState(null)
  const [orderDraft, setOrderDraft] = useState(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const formatLocal = (d) => {
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const toDateOnly = (value) => (value ? String(value).slice(0, 10) : '')

  const toStartDateTime = (dateOnly) => {
    if (!dateOnly) return ''
    const d = new Date(dateOnly)
    d.setHours(0, 0, 0, 0)
    return formatLocal(d)
  }

  const toEndDateTime = (dateOnly) => {
    if (!dateOnly) return ''
    const d = new Date(dateOnly)
    d.setHours(23, 59, 0, 0)
    return formatLocal(d)
  }

  const [startDate, setStartDate] = useState(() => toStartDateTime(new Date().toISOString().slice(0, 10)))
  const [endDate, setEndDate] = useState(() => toEndDateTime(new Date().toISOString().slice(0, 10)))

  useEffect(() => {
    setGlobalDateFilter({ startDate: toDateOnly(startDate), endDate: toDateOnly(endDate), preset: 'custom' })
  }, [startDate, endDate])

  // Helpers to set dates but default the time portion to full-day bounds
  const setStartDateWithDefault = (val) => {
    if (!val) {
      setStartDate('')
      setGlobalDateFilter({ startDate: '', endDate: toDateOnly(endDate), preset: 'custom' })
      return
    }
    const d = new Date(val)
    d.setHours(0, 0, 0, 0)
    const next = formatLocal(d)
    setStartDate(next)
    setGlobalDateFilter({ startDate: toDateOnly(next), endDate: toDateOnly(endDate), preset: 'custom' })
  }

  const setEndDateWithDefault = (val) => {
    if (!val) {
      setEndDate('')
      setGlobalDateFilter({ startDate: toDateOnly(startDate), endDate: '', preset: 'custom' })
      return
    }
    const d = new Date(val)
    d.setHours(23, 59, 0, 0)
    const next = formatLocal(d)
    setEndDate(next)
    setGlobalDateFilter({ startDate: toDateOnly(startDate), endDate: toDateOnly(next), preset: 'custom' })
  }

  // Pagination
  const ITEMS_PER_PAGE = 50
  const [currentPage, setCurrentPage] = useState(1)
  const listTopRef = useRef(null)
  const pollingRef = useRef(false)

  const fetchOrders = async ({ silent = false, includeSettings = true } = {}) => {
    if (!silent) setLoading(true)
    try {
      const requests = [axios.get('/api/sales?includeCancelled=true')]
      if (includeSettings) requests.push(axios.get('/api/settings'))
      const [salesRes, settingsRes] = await Promise.allSettled(requests)
      if (salesRes.status === 'fulfilled') {
        // Exclude internal adjustment entries (created for refunds/exchanges)
        const allSales = salesRes.value.data || []
        const visibleSales = allSales.filter(s => ((s.saleType || 'local').toLowerCase() !== 'adjustment') && !s._internal)
        setOrders(visibleSales)
      }
      if (settingsRes?.status === 'fulfilled') {
        setShopSettings(settingsRes.value.data || {})
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  useEffect(() => {
    const pollOrders = async () => {
      if (pollingRef.current) return
      pollingRef.current = true
      try {
        await fetchOrders({ silent: true, includeSettings: false })
      } finally {
        pollingRef.current = false
      }
    }

    const intervalId = window.setInterval(pollOrders, 5000)
    return () => window.clearInterval(intervalId)
  }, [])

  // Reset to first page whenever filters/search/date change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, startDate, endDate, activeFilter])

  const filteredBySearchAndDate = orders.filter(o => {
    const matchesSearch =
      !searchTerm ||
      o.receiptNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer?.phone?.includes(searchTerm) ||
      o.customer?.deliveryStation?.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    if (startDate) {
      const sd = new Date(startDate)
      if (new Date(o.date) < sd) return false
    }
    if (endDate) {
      const ed = new Date(endDate)
      if (new Date(o.date) > ed) return false
    }

    return true
  })

  const filteredOrders = filteredBySearchAndDate.filter(o => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'local' || activeFilter === 'online') return ((o.saleType || 'local').toLowerCase() === activeFilter)
    if (activeFilter === 'new') {
      // Strict: only online orders with status exactly 'new'
      const saleType = (o.saleType || 'local').toLowerCase()
      const status = (o.status || 'new').toLowerCase()
      return saleType === 'online' && status === 'new'
    }
    const status = (o.status || 'new').toLowerCase()
    return status === activeFilter
  })

  // Pagination calculations
  const totalItems = filteredOrders.length
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

  const statusCounts = {
    all: filteredBySearchAndDate.length,
    pending: filteredBySearchAndDate.filter(o => (o.status || '').toLowerCase() === 'pending').length,
    // "New" should only count online orders with status 'new'
    new: filteredBySearchAndDate.filter(o => ((o.saleType || 'local').toLowerCase() === 'online') && ((o.status || 'new').toLowerCase() === 'new')).length,
    packing: filteredBySearchAndDate.filter(o => (o.status || '').toLowerCase() === 'packing').length,
    shipped: filteredBySearchAndDate.filter(o => (o.status || '').toLowerCase() === 'shipped').length,
    delivered: filteredBySearchAndDate.filter(o => (o.status || '').toLowerCase() === 'delivered').length,
    cancelled: filteredBySearchAndDate.filter(o => (o.status || '').toLowerCase() === 'cancelled').length
  }

  const orderTypeCounts = {
    all: filteredBySearchAndDate.length,
    local: filteredBySearchAndDate.filter(o => (o.saleType || 'local') === 'local').length,
    online: filteredBySearchAndDate.filter(o => (o.saleType || 'local') === 'online').length
  }

  async function updateStatus(id, status) {
    try {
      await axios.put(`/api/sales/${id}`, { status })
      setOrders(prev => prev.map(o => (o._id === id ? { ...o, status } : o)))
    } catch (err) {
      alert('Status update failed')
    }
  }

  function openOrderEditor(order) {
    setEditingOrder(order)
    setOrderDraft({
      customer: {
        name: order.customer?.name || '',
        phone: order.customer?.phone || '',
        address: order.customer?.address || '',
        city: order.customer?.city || '',
        deliveryStation: order.customer?.deliveryStation || ''
      },
      items: (order.items || []).map(item => ({
        productId: String(item.productId), sku: item.sku || '', title: item.title || 'Item',
        color: item.color || '', size: item.size || '', qty: Number(item.qty || 1), unitPrice: Number(item.unitPrice || 0)
      }))
    })
  }

  function updateDraftItem(index, field, value) {
    setOrderDraft(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)
    }))
  }

  async function saveOrderDetails() {
    if (!editingOrder || !orderDraft || savingOrder) return
    if (orderDraft.items.length === 0) return alert('An order must contain at least one item.')
    setSavingOrder(true)
    try {
      const response = await axios.put(`/api/sales/${editingOrder._id}/order-details`, orderDraft)
      setOrders(current => current.map(order => order._id === response.data._id ? response.data : order))
      setEditingOrder(null)
      setOrderDraft(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update this order.')
    } finally {
      setSavingOrder(false)
    }
  }

  async function confirmPendingOrder(id) {
    try {
      await axios.post(`/api/sales/${id}/confirm`)
      fetchOrders()
    } catch (err) {
      alert(err.response?.data?.error || 'Could not confirm this payment')
    }
  }

  function openReceiptView(id) {
    openAdminReceipt(`/api/sales/${id}/receipt`)
      .catch(error => alert(error.message || 'Could not open receipt'))
  }

  function openReceiptPrint(id) {
    axios.get(`/api/sales/${id}/receipt`, { responseType: 'text' })
      .then(r => {
        const win = window.open('', '_blank')
        if (!win) return alert('Popup blocked')
        // Inject print-friendly CSS to ensure A4 top-left alignment and remove browser headers/footers
        const printStyle = `
          <style>
            @page { size: A4; margin: 0; }
            @media print {
              html, body { height: 100%; margin: 0; padding: 0; }
              body { -webkit-print-color-adjust: exact; }
              /* ensure content aligns to top-left */
              .print-root { margin: 0; padding: 12mm 12mm 0 12mm; }
            }
          </style>`

        let html = r.data || ''
        // try to inject into existing <head>, otherwise prepend a minimal wrapper
        if (html.includes('</head>')) {
          html = html.replace('</head>', printStyle + '</head>')
        } else if (html.startsWith('<!doctype') || html.startsWith('<html')) {
          // attempt to insert a head
          html = html.replace(/<html(.*?)>/i, match => match + `<head>${printStyle}</head>`)
        } else {
          // wrap the html fragment
          html = `<!doctype html><html><head>${printStyle}</head><body class="print-root">` + html + `</body></html>`
        }

        // ensure print script runs after CSS is applied
        html = html + `<script>window.onload=function(){window.print();setTimeout(()=>window.close(),200);}</script>`

        win.document.open()
        win.document.write(html)
        win.document.close()
      })
      .catch(() => alert('Could not load receipt for printing'))
  }

  function escapeHtml(str) {
    if (!str) return ''
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function printShippingLabel(order) {
    const customer = order.customer || {}
    const name = escapeHtml(customer.name || '')
    const phone = escapeHtml(customer.phone || '')
    const address = escapeHtml(customer.address || '')
    const city = escapeHtml(customer.city || '')
    const service = escapeHtml(customer.deliveryStation || customer.deliveryService || '')
    const receipt = escapeHtml(order.receiptNumber || order._id)

    const sender = shopSettings?.sender || {}
    const senderName = escapeHtml(sender.shopName || 'Win & Chit')
    const senderPhone = escapeHtml(sender.phone || '09-123456789')
    const senderAddress = escapeHtml(sender.address || 'Yangon, Myanmar')
    const senderCity = escapeHtml(sender.city || 'Yangon')
    const senderTagline = escapeHtml(sender.tagline || 'Online Shop')

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shipping Label - ${receipt}</title>
        <style>
          @page { size: A4; margin: 14mm }
          html, body { height: 100%; margin: 0; padding: 0 }
          body { -webkit-print-color-adjust: exact; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; margin:0; padding:0; color:#1c1c1c; font-size:11.5px; line-height:1.5 }

          .content{ position:relative; z-index:1; max-width:180mm; margin:0 auto }

          /* Watermark: centered within the content block so it sits behind the address/details area, not the full page */
          .watermark { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); opacity:0.05; width:42%; max-width:340px; pointer-events:none; z-index:0 }
          .header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom:12px; margin-bottom:18px; border-bottom:2px solid #1c1c1c }
          .header-left{ display:flex; align-items:center; gap:10px }
          .logo{ width:42px; height:42px; object-fit:contain; flex-shrink:0 }
          .shop-title{ font-size:14px; font-weight:700; margin:0; letter-spacing:0.2px }
          .shop-sub{ color:#8a8a8a; font-size:8.5px; text-transform:uppercase; letter-spacing:1px; margin-top:2px }
          .order-meta{ text-align:right; font-size:10px; color:#555; line-height:1.6 }
          .order-meta strong{ color:#111; font-size:11px }

          .shipping-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px }
          .party-card { border:1.5px solid #e2e8f0; border-radius:8px; padding:14px; background:#fafafa }
          .party-card.recipient { border-color:#1c1c1c; background:#ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.04) }

          .party-badge { display:inline-block; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; padding:3px 8px; border-radius:4px; margin-bottom:10px }
          .badge-sender { background:#f1f5f9; color:#475569; border:1px solid #cbd5e1 }
          .badge-recipient { background:#1c1c1c; color:#ffffff }

          .party-name { font-size:14px; font-weight:700; color:#0f172a; margin-bottom:4px }
          .party-phone { font-size:11.5px; font-weight:600; color:#334155; margin-bottom:8px }
          .party-addr { font-size:11px; line-height:1.5; color:#475569 }
          
          .delivery-service-box { margin-top:14px; padding:10px 12px; background:#f8fafc; border:1px dashed #94a3b8; border-radius:6px; display:flex; align-items:center; justify-content:space-between }
          .service-label { font-size:9.5px; font-weight:700; text-transform:uppercase; color:#64748b }
          .service-value { font-size:12px; font-weight:700; color:#0f172a }

          .footer-note{ margin-top:28px; text-align:center; font-size:9px; color:#94a3b8 }

          /* Hide UI elements when printing */
          .no-print{ display:inline-block }
          @media print{
            .no-print{ display:none !important }
            body{ padding:0 }
          }
        </style>
        </head><body>
        <div class="content">
          <!-- Single watermark image, centered on the content block, faint and behind all content -->
          <img class="watermark" src="/assets/watermark-logo.png" alt="" />

          <div class="header">
            <div class="header-left">
              <img class="logo" src="/assets/winandchit-logo.png" alt="Win & Chit logo" />
              <div>
                <h1 class="shop-title">${senderName}</h1>
                <div class="shop-sub">${senderTagline}</div>
              </div>
            </div>
            <div class="order-meta">
              <div>Order: <strong>${receipt}</strong></div>
              <div>${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div class="shipping-grid">
            <!-- Sender Card -->
            <div class="party-card sender">
              <div class="party-badge badge-sender">📤 ပေးပို့သူ (Sender)</div>
              <div class="party-name">${senderName}</div>
              <div class="party-phone">📞 ${senderPhone}</div>
              <div class="party-addr">${senderAddress}${senderCity && !senderAddress.includes(senderCity) ? ', ' + senderCity : ''}</div>
            </div>

            <!-- Recipient Card -->
            <div class="party-card recipient">
              <div class="party-badge badge-recipient">📥 လက်ခံသူ (Recipient)</div>
              <div class="party-name">${name || 'Customer'}</div>
              <div class="party-phone">📞 ${phone || '—'}</div>
              <div class="party-addr">${address || 'No address provided'}${city ? ', ' + city : ''}</div>
            </div>
          </div>

          ${service ? `
            <div class="delivery-service-box">
              <span class="service-label">🚌 Delivery Service / Bus Gate (ဂိတ်/ပို့ဆောင်ရေး):</span>
              <span class="service-value">${service}</span>
            </div>
          ` : ''}

          <div class="footer-note">Thank you for ordering with ${senderName}!</div>
        </div>
        <script>window.onload=function(){window.print(); setTimeout(()=>window.close(),200)}</script>
        </body></html>`

    const w = window.open('', '_blank')
    if (!w) return alert('Popup blocked')
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  async function cancelOrder(id, status) {
    if (!confirm('Cancel this order? This cannot be undone. Click OK to proceed.')) return
    const reason = prompt('Cancellation reason to send the customer:', 'Payment could not be verified.')
    if (reason === null) return
    const restock = status === 'pending' ? false : confirm('Also restock items back to inventory? Click OK to restock.')
    try {
      const r = await axios.post(`/api/sales/${id}/cancel`, { restock, reason })
      fetchOrders()
      if (r.data && r.data.totals) console.log('Updated totals after cancel:', r.data.totals)
      alert('Order cancelled')
    } catch (e) {
      alert('Could not cancel order: ' + (e.response?.data?.error || e.message))
    }
  }

  async function handleRefundExchange(order) {
    try {
      if (!window.confirm('Are you sure you want to refund this order/item?')) return

      const response = await axios.post(`/api/sales/${order._id}/refund`, { reason: 'Refund via Orders UI' })
      // notify other views/tabs to refresh (dashboard, pos)
      try { localStorage.setItem('salesRefresh', String(Date.now())) } catch (e) {}
      fetchOrders()
      alert(response.data?.totals ? 'Refund recorded. Totals updated.' : 'Refund recorded.')
    } catch (err) {
      alert('Could not perform refund: ' + (err.response?.data?.error || err.message))
    }
  }

  const getStatusBadgeClass = status => {
    switch (status?.toLowerCase()) {
      case 'packing': return 'badge-warning'
      case 'shipped': return 'badge-primary'
      case 'cancelled': return 'badge-danger'
      case 'delivered': return 'badge-success'
      default: return 'badge-neutral'
    }
  }

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Order Management & Packing</h1>
          <p className="page-subtitle">Manage customer deliveries, bus gates, packing queues, and order statuses</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchOrders} disabled={loading}><RefreshCw size={16} /> Refresh Orders</button>
      </div>

      <div className="search-filter-bar">
        <div className="search-input-wrap">
          <span className="search-icon-svg"><Search size={16} strokeWidth={2} /></span>
          <input className="form-input" placeholder="Search by receipt #, customer name, phone, or bus gate..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
              From:
              <input type="datetime-local" value={startDate} onChange={e => setStartDateWithDefault(e.target.value)} style={{ marginLeft: 6 }} />
            </label>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
              To:
              <input type="datetime-local" value={endDate} onChange={e => setEndDateWithDefault(e.target.value)} style={{ marginLeft: 6 }} />
            </label>

            <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} onClick={() => {
              const s = new Date(); s.setHours(0,0,0,0)
              const e = new Date(); e.setHours(23,59,0,0)
              const nextStart = formatLocal(s)
              const nextEnd = formatLocal(e)
              setStartDate(nextStart)
              setEndDate(nextEnd)
              setGlobalDateFilter({ startDate: toDateOnly(nextStart), endDate: toDateOnly(nextEnd), preset: 'today' })
            }}>Today</button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => {
                const next = resetGlobalDateFilterToToday()
                setStartDate(toStartDateTime(next.startDate))
                setEndDate(toEndDateTime(next.endDate))
                fetchOrders()
              }}>Clear Date</button>
              <button className="btn btn-sm btn-primary" onClick={() => fetchOrders()}>Apply</button>
            </div>
          </div>

          {/* Tabs row placed below date inputs to keep a single-line layout */}
          <div style={{ width: '100%' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', whiteSpace: 'nowrap', marginTop: 8, paddingLeft: 12, alignItems: 'center' }}>
          {[
            { key: 'all', label: 'All', kind: 'all' },
            { key: 'local', label: 'Local', kind: 'type' },
            { key: 'online', label: 'Online', kind: 'type' },
            { key: 'pending', label: 'Pending payment', kind: 'status' },
            { key: 'new', label: 'New', kind: 'status' },
            { key: 'packing', label: 'Packing', kind: 'status' },
            { key: 'shipped', label: 'Shipped', kind: 'status' },
            { key: 'delivered', label: 'Delivered', kind: 'status' },
            { key: 'cancelled', label: 'Cancelled', kind: 'status' }
          ].map(tab => {
            const isSelected = activeFilter === tab.key
            const count = tab.kind === 'type' ? (orderTypeCounts[tab.key] || 0) : (statusCounts[tab.key] || (tab.key === 'all' ? orderTypeCounts.all : 0))
            const showBadge = (tab.key === 'new' || tab.key === 'pending') && count > 0
            return (
              <button key={tab.key} className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveFilter(tab.key)} style={{ textTransform: 'capitalize', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span>{tab.label}</span>
                {/* Always show numeric count for every tab */}
                <span style={{ opacity: 0.8, fontSize: '0.75rem', marginLeft: 6 }}>({count})</span>
                {/* For 'new' tab only, show a small red notification dot when there are new orders */}
                {(tab.key === 'new' || tab.key === 'pending') && count > 0 && (
                  <span aria-hidden="true" title={`${count} new orders`} style={{ display: 'inline-block', marginLeft: 8, width: 12, height: 12, borderRadius: 999, background: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.12)' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ marginBottom: 12, display: 'inline-flex', color: 'var(--text-muted)' }}><PackageX size={40} /></div>
          <h3 style={{ marginBottom: 6 }}>No orders found</h3>
          <p style={{ color: 'var(--text-muted)' }}>{searchTerm || activeFilter !== 'all' ? 'No orders match your current filters.' : 'New orders checked out from the POS will appear here.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} ref={listTopRef}>
          {paginatedOrders.map(o => {
            const currentStatus = (o.status || 'new').toLowerCase()
            const isRefunded = Array.isArray(o.refunds) && o.refunds.length > 0
            const isUnconfirmed = (o.saleType || 'local') === 'online' && (currentStatus === 'pending' || !o.confirmedAt)
            return (
              <div key={o._id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border-default)', paddingBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ReceiptText size={18} /> {o.receiptNumber}</span>
                    <span className={`badge ${getStatusBadgeClass(o.status)}`}>{o.status || 'New Order'}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarDays size={14} /> {new Date(o.date).toLocaleString()}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, margin: '16px 0' }}>
                  <div style={{ background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                    <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={14} /> Customer & Shipping Details</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.9rem' }}>
                      { (o.saleType || 'local') === 'online' ? (
                        <>
                          <div><strong style={{ color: 'var(--text-secondary)' }}>Customer: </strong><span>{o.customer?.name || '—'}</span></div>
                          {o.customer?.phone && <div><strong style={{ color: 'var(--text-secondary)' }}>Phone: </strong><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={13} /> {o.customer.phone}</span></div>}
                          {o.customer?.deliveryStation && <div><strong style={{ color: 'var(--text-secondary)' }}>Delivery Service: </strong><span style={{ color: 'var(--color-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Bus size={13} /> {o.customer.deliveryStation}</span></div>}
                          {o.customer?.address && <div><strong style={{ color: 'var(--text-secondary)' }}>Address: </strong><span>{o.customer.address}{o.customer?.city ? (', ' + o.customer.city) : ''}</span></div>}
                        </>
                      ) : (
                        <div><strong style={{ color: 'var(--text-secondary)' }}>Customer: </strong><span>Walk-in / In-Store</span></div>
                      )}

                      <div><strong style={{ color: 'var(--text-secondary)' }}>Payment: </strong><span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>{o.paymentMethod || 'cash'}</span></div>
                          {o.paymentSlipUrl && <a href={o.paymentSlipUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ width: 'fit-content', marginTop: 4 }}>View transfer receipt</a>}
                    </div>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Package2 size={14} /> Packing Items ({o.items?.reduce((s, i) => s + i.qty, 0)} pcs)</h4>
                    <div className="table-responsive">
                      <table className="data-table" style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th style={{ width: 45, textAlign: 'center' }}>Photo</th>
                            <th>Item & Variant</th>
                            <th style={{ textAlign: 'center' }}>Qty</th>
                            <th style={{ textAlign: 'right' }}>Unit Price</th>
                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.items?.map((it, idx) => {
                            const imgUrl = it.image ? (String(it.image).startsWith('http') ? it.image : `/api/products/images/${it.image}`) : null
                            return (
                              <tr key={idx}>
                                <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                                  <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#eee', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {imgUrl ? <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} /> : <Package2 size={16} color="var(--text-muted)" />}
                                  </div>
                                </td>
                                <td>
                                  <strong>{it.title || 'Clothing Item'}</strong>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                    {it.color && <ColorSwatch color={it.color} size={10} />}
                                    {it.color && <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{it.color} </span>}
                                    {it.size && <span>• Size: {it.size} </span>}
                                    <span style={{ color: 'var(--text-muted)' }}>({it.sku})</span>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700 }}><span className="badge badge-neutral">{it.qty}</span></td>
                                <td style={{ textAlign: 'right' }}>
                                  {it.hasDiscount || it.discountPercentage > 0 ? (
                                    <div className="discounted-price-display" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ textDecoration: 'line-through', color: '#ef4444', fontSize: '0.75rem' }}>
                                          {(it.originalPrice || it.unitPrice)?.toLocaleString()} Ks
                                        </span>
                                        <span style={{ background: '#ef4444', color: '#fff', padding: '1px 4px', borderRadius: 4, fontSize: '10px' }}>
                                          -{it.discountPercentage}%
                                        </span>
                                      </div>
                                      <span>{it.unitPrice?.toLocaleString()} Ks</span>
                                    </div>
                                  ) : (
                                    <span>{it.unitPrice?.toLocaleString()} Ks</span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{it.subtotal?.toLocaleString()} Ks</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderTop: '1px solid var(--border-default)', paddingTop: 14 }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Total Amount: <span style={{ color: 'var(--color-primary)' }}>{o.total?.toLocaleString()} Ks</span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {isUnconfirmed && currentStatus !== 'cancelled' && (
                      <button className="btn btn-success btn-sm" onClick={() => confirmPendingOrder(o._id)}><CheckCircle2 size={14} /> Confirm</button>
                    )}

                    {!isUnconfirmed && <>
                      <button className="btn btn-secondary btn-sm" onClick={() => openOrderEditor(o)} disabled={isRefunded || currentStatus === 'cancelled'} title={isRefunded || currentStatus === 'cancelled' ? 'Cancelled or refunded orders cannot be edited' : 'Edit order details'}><Pencil size={14} /> Edit Order</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openReceiptPrint(o._id)}><Printer size={14} /> Print Receipt</button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRefundExchange(o)}
                        disabled={isRefunded}
                        style={isRefunded ? { background: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.45)', color: 'rgba(254,202,202,0.95)', cursor: 'not-allowed', opacity: 0.7 } : undefined}
                        title={isRefunded ? 'Already refunded' : 'Refund this order'}
                      ><Undo2 size={14} /> Refund / Exchange</button>

                      { (o.saleType || 'local') === 'online' && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => printShippingLabel(o)}><Tag size={14} /> Print Label</button>
                          {currentStatus !== 'packing' && <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(o._id, 'packing')}><Package2 size={14} /> Set Packing</button>}
                          {currentStatus !== 'shipped' && <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(o._id, 'shipped')}><Truck size={14} /> Set Shipped</button>}
                          {currentStatus !== 'delivered' && <button className="btn btn-success btn-sm" onClick={() => updateStatus(o._id, 'delivered')}><CheckCircle2 size={14} /> Mark Delivered</button>}
                        </>
                      )}
                    </>}

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => cancelOrder(o._id, currentStatus)}
                      disabled={isRefunded}
                      style={isRefunded ? { background: 'rgba(239,68,68,0.18)', borderColor: 'rgba(239,68,68,0.45)', color: 'rgba(254,202,202,0.95)', cursor: 'not-allowed', opacity: 0.7 } : undefined}
                      title={isRefunded ? 'Already refunded; cannot cancel' : 'Cancel order'}
                    ><XCircle size={14} /> Cancel Order</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {/* Pagination controls */}
      {totalItems > ITEMS_PER_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => { if (currentPage > 1) { setCurrentPage(p => p-1); listTopRef.current?.scrollIntoView({ behavior: 'smooth' }) } }} disabled={currentPage === 1}><ChevronLeft size={14} /> Previous</button>
          <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>Page {currentPage} of {totalPages}</div>
          <button className="btn btn-sm btn-secondary" onClick={() => { if (currentPage < totalPages) { setCurrentPage(p => p+1); listTopRef.current?.scrollIntoView({ behavior: 'smooth' }) } }} disabled={currentPage === totalPages}>Next <ChevronRight size={14} /></button>
        </div>
      )}
      {editingOrder && orderDraft && <div className="order-edit-backdrop" role="dialog" aria-modal="true" aria-label="Edit order" onClick={() => !savingOrder && setEditingOrder(null)}><section className="order-edit-modal" onClick={event => event.stopPropagation()}><div className="order-edit-head"><div><h2>Edit Order</h2><span>{editingOrder.receiptNumber}</span></div><button type="button" onClick={() => setEditingOrder(null)} disabled={savingOrder} aria-label="Close edit order"><XCircle size={20} /></button></div><div className="order-edit-fields"><label>Customer name<input className="form-input" value={orderDraft.customer.name} onChange={event => setOrderDraft(current => ({ ...current, customer: { ...current.customer, name: event.target.value } }))} /></label><label>Phone<input className="form-input" value={orderDraft.customer.phone} onChange={event => setOrderDraft(current => ({ ...current, customer: { ...current.customer, phone: event.target.value } }))} /></label><label>Delivery service<DeliveryServicePicker services={shopSettings?.deliveryServices || []} value={orderDraft.customer.deliveryStation} onChange={value => setOrderDraft(current => ({ ...current, customer: { ...current.customer, deliveryStation: value } }))} /></label><label>City<input className="form-input" value={orderDraft.customer.city} onChange={event => setOrderDraft(current => ({ ...current, customer: { ...current.customer, city: event.target.value } }))} /></label><label className="order-edit-address">Address<textarea className="form-textarea" value={orderDraft.customer.address} onChange={event => setOrderDraft(current => ({ ...current, customer: { ...current.customer, address: event.target.value } }))} /></label></div><div className="order-edit-items"><strong>Order contents</strong>{orderDraft.items.map((item, index) => <div className="order-edit-item" key={`${item.productId}-${item.sku}`}><div><strong>{item.title}</strong><span>{[item.color, item.size, item.sku].filter(Boolean).join(' · ')}</span></div><label>Qty<input type="number" min="1" className="form-input" value={item.qty} onChange={event => updateDraftItem(index, 'qty', event.target.value)} /></label><label>Unit price<input type="number" min="0" className="form-input" value={item.unitPrice} onChange={event => updateDraftItem(index, 'unitPrice', event.target.value)} /></label><button type="button" className="btn btn-danger btn-sm" onClick={() => setOrderDraft(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} disabled={orderDraft.items.length === 1}>Remove</button></div>)}</div><div className="order-edit-actions"><button type="button" className="btn btn-secondary" onClick={() => { setEditingOrder(null); setOrderDraft(null) }} disabled={savingOrder}>Cancel</button><button type="button" className="btn btn-primary" onClick={saveOrderDetails} disabled={savingOrder || orderDraft.items.length === 0}>{savingOrder ? 'Saving...' : 'Save Order'}</button></div></section></div>}
    </div>
  )
}
