import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { BarChart3, CalendarDays, RefreshCw, Boxes, Wallet, ShoppingBag, ReceiptText, Undo2, TrendingUp, CalendarRange, PieChart, X } from 'lucide-react'
import { getGlobalDateFilter, setGlobalDateFilter, resetGlobalDateFilterToToday } from '../utils/globalDateFilter'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDatesBetween = (start, end) => {
  const s = new Date(start)
  const e = new Date(end)
  const days = []
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    days.push(getLocalDateStr(new Date(d)))
  }
  return days
}

const parseYmd = (value = '') => {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

const getTrendMode = (preset, sDate, eDate) => {
  const today = getLocalDateStr()
  const isToday = (preset === 'today') || (sDate && eDate && sDate === eDate && sDate === today)
  if (isToday) return 'hour'
  if (preset === 'all') return 'year'
  return 'day'
}

const getAxisStep = (count, mode) => {
  if (mode === 'hour') return Math.max(1, Math.ceil(count / 8))
  if (mode === 'day') return Math.max(1, Math.ceil(count / 10))
  return 1
}

const formatTrendAxisLabel = (rawLabel, idx, total, mode, step) => {
  const show = idx === 0 || idx === total - 1 || (idx % step === 0)
  if (!show) return ''

  if (mode === 'hour' || mode === 'year') return String(rawLabel || '')

  const parsed = parseYmd(String(rawLabel || ''))
  if (!parsed) return String(rawLabel || '')
  const dd = String(parsed.day).padStart(2, '0')
  const monthName = MONTH_SHORT[Math.max(0, Math.min(11, parsed.month - 1))]

  // Keep axis compact: mostly day numbers, but include month on first/last and month boundaries.
  if (idx === 0 || idx === total - 1 || parsed.day === 1) return `${monthName} ${dd}`
  return dd
}

const formatTrendTooltipLabel = (rawLabel, mode) => {
  if (mode === 'hour' || mode === 'year') return String(rawLabel || '')
  const parsed = parseYmd(String(rawLabel || ''))
  if (!parsed) return String(rawLabel || '')
  return `${MONTH_SHORT[Math.max(0, Math.min(11, parsed.month - 1))]} ${parsed.day}, ${parsed.year}`
}

const buildTrendPeriodLabel = (mode, sDate, eDate) => {
  if (mode === 'year') return 'All Years'

  const fallback = parseYmd(eDate || sDate || getLocalDateStr())
  if (!sDate || !eDate) {
    if (!fallback) return 'Selected Period'
    return `${MONTH_SHORT[fallback.month - 1]} ${fallback.year}`
  }

  const s = parseYmd(sDate)
  const e = parseYmd(eDate)
  if (!s || !e) return 'Selected Period'
  if (s.year === e.year && s.month === e.month) return `${MONTH_SHORT[s.month - 1]} ${s.year}`
  if (s.year === e.year) return `${MONTH_SHORT[s.month - 1]} - ${MONTH_SHORT[e.month - 1]} ${s.year}`
  return `${MONTH_SHORT[s.month - 1]} ${s.year} - ${MONTH_SHORT[e.month - 1]} ${e.year}`
}

export default function AdminDashboard() {
  const initialGlobalDate = getGlobalDateFilter()
  const [daily, setDaily] = useState([])
  const [monthly, setMonthly] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [financialSummary, setFinancialSummary] = useState({ grossRevenue: 0, totalRefunds: 0, netRevenue: 0 })
  const [showRefundDetailsModal, setShowRefundDetailsModal] = useState(false)
  const [refundDetailsLoading, setRefundDetailsLoading] = useState(false)
  const [refundDetails, setRefundDetails] = useState([])
  const [showNetBreakdownModal, setShowNetBreakdownModal] = useState(false)
  const [netBreakdownLoading, setNetBreakdownLoading] = useState(false)
  const [netBreakdown, setNetBreakdown] = useState({ grossRevenue: 0, totalRefunds: 0, netRevenue: 0, paymentBreakdown: [] })

  // Date filtering state - default to Today
  const todayStr = getLocalDateStr()
  const [startDate, setStartDate] = useState(initialGlobalDate.startDate || todayStr)
  const [endDate, setEndDate] = useState(initialGlobalDate.endDate || todayStr)
  const [activeFilterPreset, setActiveFilterPreset] = useState(initialGlobalDate.preset || 'today')

  useEffect(() => {
    setGlobalDateFilter({ startDate, endDate, preset: activeFilterPreset })
  }, [startDate, endDate, activeFilterPreset])

  async function fetchFinancialSummary(sDate, eDate) {
    try {
      const resp = await axios.get('/api/sales/report/summary', { params: { startDate: sDate || undefined, endDate: eDate || undefined } })
      setFinancialSummary(resp.data || { grossRevenue: 0, totalRefunds: 0, netRevenue: 0 })
    } catch (err) {
      setFinancialSummary({ grossRevenue: 0, totalRefunds: 0, netRevenue: 0 })
    }
  }

  async function openRefundDetailsModal() {
    setShowRefundDetailsModal(true)
    setRefundDetailsLoading(true)
    try {
      const params = { startDate: startDate || undefined, endDate: endDate || undefined }
      const resp = await axios.get('/api/sales/report/refunds-detail', { params })
      setRefundDetails(Array.isArray(resp.data) ? resp.data : [])
    } catch (err) {
      setRefundDetails([])
    } finally {
      setRefundDetailsLoading(false)
    }
  }

  async function openNetBreakdownModal() {
    setShowNetBreakdownModal(true)
    setNetBreakdownLoading(true)
    try {
      const params = { startDate: startDate || undefined, endDate: endDate || undefined }
      const resp = await axios.get('/api/sales/report/net-breakdown', { params })
      setNetBreakdown(resp.data || { grossRevenue: 0, totalRefunds: 0, netRevenue: 0, paymentBreakdown: [] })
    } catch (err) {
      setNetBreakdown({ grossRevenue: 0, totalRefunds: 0, netRevenue: 0, paymentBreakdown: [] })
    } finally {
      setNetBreakdownLoading(false)
    }
  }

  const fetchReports = (sDate = startDate, eDate = endDate) => {
    setLoading(true)
    const params = {}
    if (sDate) params.startDate = sDate
    if (eDate) params.endDate = eDate

    // Determine grouping mode for chart
    const isToday = (activeFilterPreset === 'today') || (sDate && eDate && sDate === eDate && sDate === getLocalDateStr())
    const useHourGrouping = isToday
    const useYearGrouping = (activeFilterPreset === 'all')

    // Fetch recent orders always
    const ordersPromise = axios.get('/api/sales', { params }).catch(() => ({ data: [] }))

    if (useHourGrouping) {
      // For today: fetch raw sales list and aggregate hourly client-side
      Promise.all([ordersPromise])
        .then(async ([ordersRes]) => {
          const orders = (ordersRes.data || []).filter(order =>
            order.saleType !== 'adjustment' &&
            (order.saleType !== 'online' || Boolean(order.confirmedAt))
          )
          // build 24 hour buckets
          const buckets = Array.from({ length: 24 }, (_, i) => ({ _id: `${String(i).padStart(2, '0')}:00`, totalRevenue: 0, totalItems: 0, orderCount: 0 }))
          for (const o of orders) {
            const d = new Date(o.date)
            const hr = d.getHours()
            buckets[hr].totalRevenue += Number(o.total || 0)
            buckets[hr].orderCount += 1
            buckets[hr].totalItems += (o.items || []).reduce((s, it) => s + (it.qty || 0), 0)
          }
          setDaily(buckets)
          // also set monthly empty and recentOrders
          setMonthly([])
          setRecentOrders(orders)
          await fetchFinancialSummary(sDate, eDate)
        })
        .catch(() => {
          setDaily([]); setMonthly([]); setRecentOrders([])
        })
        .finally(() => setLoading(false))
      return
    }

    if (useYearGrouping) {
      // All time: fetch monthly then aggregate into years
      Promise.all([
        axios.get('/api/sales/report/month', { params }).catch(() => ({ data: [] })),
        ordersPromise
      ])
        .then(async ([monthRes, ordersRes]) => {
          const months = monthRes.data || []
          const yearsMap = {}
          months.forEach(m => {
            const year = (m._id || '').slice(0, 4) || 'Unknown'
            if (!yearsMap[year]) yearsMap[year] = { _id: year, totalRevenue: 0, totalItems: 0, orderCount: 0 }
            yearsMap[year].totalRevenue += Number(m.totalRevenue || 0)
            yearsMap[year].totalItems += Number(m.totalItems || 0)
            yearsMap[year].orderCount += Number(m.orderCount || 0)
          })
          const years = Object.values(yearsMap).sort((a, b) => a._id.localeCompare(b._id))
          setDaily(years)
          setMonthly(months)
          setRecentOrders((ordersRes.data || []).filter(order => order.saleType !== 'adjustment'))
          await fetchFinancialSummary(sDate, eDate)
        })
        .catch(() => { setDaily([]); setMonthly([]); setRecentOrders([]) })
        .finally(() => setLoading(false))
      return
    }

    // Default: use day grouping
    Promise.all([
      axios.get('/api/sales/report/day', { params }).catch(() => ({ data: [] })),
      axios.get('/api/sales/report/month', { params }).catch(() => ({ data: [] })),
      ordersPromise
    ])
      .then(async ([dailyRes, monthlyRes, ordersRes]) => {
        const rawDaily = dailyRes.data || []
        // If we have explicit start/end dates (presets or custom), fill missing days with zeros
        if (sDate && eDate) {
          try {
            const days = getDatesBetween(sDate, eDate)
            const map = {}
            rawDaily.forEach(d => { map[d._id] = d })
            const filled = days.map(day => {
              const src = map[day]
              return {
                _id: day,
                orderCount: Number(src?.orderCount || 0),
                totalItems: Number(src?.totalItems || 0),
                totalRevenue: Number(src?.totalRevenue || 0)
              }
            })
            setDaily(filled)
          } catch (err) {
            setDaily(rawDaily)
          }
        } else {
          setDaily(rawDaily)
        }
        setMonthly(monthlyRes.data || [])
        setRecentOrders((ordersRes.data || []).filter(order => order.saleType !== 'adjustment'))
        await fetchFinancialSummary(sDate, eDate)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchReports(startDate, endDate)
  }, [startDate, endDate])

  // Listen for other pages signaling sales changes (refunds/cancels)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'salesRefresh') {
        fetchReports(startDate, endDate)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [startDate, endDate])

  // --- Stock Balance Modal State & Loader ---
  const [showStockModal, setShowStockModal] = useState(false)
  const [stockList, setStockList] = useState([])
  const [stockLoading, setStockLoading] = useState(false)
  const [stockTotals, setStockTotals] = useState({ totalQty: 0, totalValue: 0 })
  const [stockQuery, setStockQuery] = useState('')
  const [stockAllTime, setStockAllTime] = useState(false)
  const [stockStartDate, setStockStartDate] = useState(getLocalDateStr())
  const [stockEndDate, setStockEndDate] = useState(getLocalDateStr())
  const [stockStartTime, setStockStartTime] = useState('12:00')
  const [stockEndTime, setStockEndTime] = useState('23:59')
  const [stockFilterOpen, setStockFilterOpen] = useState(false)
  const stockFilterBtnRef = React.useRef(null)
  const stockFilterPanelRef = React.useRef(null)

  // close the small filter panel when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (!stockFilterOpen) return
      const btnEl = stockFilterBtnRef.current
      const panelEl = stockFilterPanelRef.current
      if ((btnEl && btnEl.contains(e.target)) || (panelEl && panelEl.contains(e.target))) return
      setStockFilterOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [stockFilterOpen])

  const fetchStockList = async () => {
    setStockLoading(true)
    try {
      // include optional date/time filters if set and not All Time
      const params = {}
      if (!stockAllTime && stockStartDate && stockStartTime && stockEndDate && stockEndTime) {
        // ISO-like local datetimes without timezone
        params.startDateTime = `${stockStartDate}T${stockStartTime}:00`
        params.endDateTime = `${stockEndDate}T${stockEndTime}:00`
      }
      const res = await axios.get('/api/products', { params })
      const prods = res.data || []
      // expand variants into rows
      const rows = []
      let totQty = 0
      let totVal = 0
      prods.forEach(p => {
        const variants = Array.isArray(p.variants) ? p.variants : []
        if (variants.length === 0) {
          // treat as single item with 0 price if missing
          rows.push({ title: p.title, sku: '', stock: 0, price: 0 })
        } else {
          variants.forEach(v => {
            const qty = Number(v.stock || 0)
            const price = Number(v.price || 0)
            rows.push({ title: p.title, sku: v.sku || '', stock: qty, price })
            totQty += qty
            totVal += qty * price
          })
        }
      })
      setStockList(rows)
      setStockTotals({ totalQty: totQty, totalValue: totVal })
    } catch (err) {
      console.error('Failed to fetch stock list:', err)
      setStockList([])
      setStockTotals({ totalQty: 0, totalValue: 0 })
    } finally {
      setStockLoading(false)
    }
  }

  useEffect(() => {
    if (showStockModal) {
      // when opening modal, set default time range (12:00 - 23:59)
      setStockAllTime(false)
      const today = getLocalDateStr()
      setStockStartDate(today)
      setStockEndDate(today)
      setStockStartTime('12:00')
      setStockEndTime('23:59')
      fetchStockList()
    }
  }, [showStockModal])

  const resetStockFilters = () => {
    const today = getLocalDateStr()
    setStockAllTime(false)
    setStockStartDate(today)
    setStockEndDate(today)
    setStockStartTime('12:00')
    setStockEndTime('23:59')
  }

  // --- Live Trend Chart (canvas) ---
  const chartRef = React.useRef(null)
  const [chartPoints, setChartPoints] = useState([])
  const pointsPosRef = React.useRef([])
  const [tooltip, setTooltip] = useState(null)
  const trendMode = getTrendMode(activeFilterPreset, startDate, endDate)
  const trendPeriodLabel = buildTrendPeriodLabel(trendMode, startDate, endDate)

  // draw simple sparkline-like chart
  const drawChart = (points = []) => {
    const canvas = chartRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width = canvas.clientWidth * devicePixelRatio
    const h = canvas.height = canvas.clientHeight * devicePixelRatio
    ctx.clearRect(0, 0, w, h)
    if (!points || points.length === 0) return
    const max = Math.max(...points.map(p => p.value || 0), 1)
    const min = Math.min(...points.map(p => p.value || 0), 0)
    const range = Math.max(1, max - min)

    // waveform background
    ctx.fillStyle = '#0f172a'
    ctx.globalAlpha = 0.03
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1

    // path
    ctx.beginPath()
    pointsPosRef.current = []
    points.forEach((p, i) => {
      const x = (i / (points.length - 1 || 1)) * w
      const y = h - ((p.value - min) / range) * h
      pointsPosRef.current.push({ x, y, value: p.value, label: p.label, meta: p })
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.lineWidth = 2 * devicePixelRatio
    // gradient stroke
    const grad = ctx.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, '#06b6d4')
    grad.addColorStop(1, '#06b6d4')
    ctx.strokeStyle = grad
    ctx.stroke()

    // fill under curve
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fillStyle = 'rgba(6,182,212,0.08)'
    ctx.fill()

    // draw data point markers
    ctx.fillStyle = '#06b6d4'
    pointsPosRef.current.forEach(pt => {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 3 * devicePixelRatio, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // initialize chartPoints from `daily` data and poll for updates
  useEffect(() => {
    const source = daily || []
    const step = getAxisStep(source.length, trendMode)
    const pts = source.map((d, idx) => ({
      rawLabel: d._id,
      label: formatTrendTooltipLabel(d._id, trendMode),
      axisLabel: formatTrendAxisLabel(d._id, idx, source.length, trendMode, step),
      value: Number(d.totalRevenue || 0)
    }))
    setChartPoints(pts)
    drawChart(pts)
  }, [daily, trendMode])

  useEffect(() => {
    let mounted = true
    const id = setInterval(() => {
      // refresh reports according to current grouping
      fetchReports(startDate, endDate)
    }, 5000)
    return () => { mounted = false; clearInterval(id) }
  }, [startDate, endDate])

  // Canvas mouse handlers for tooltip
  const handleChartMouseMove = (e) => {
    const canvas = chartRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * devicePixelRatio
    const y = (e.clientY - rect.top) * devicePixelRatio
    const pts = pointsPosRef.current || []
    if (!pts.length) { setTooltip(null); return }
    // find nearest by x
    let nearest = pts[0]
    let nearestIdx = 0
    let minDx = Math.abs(pts[0].x - x)
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i].x - x)
      if (dx < minDx) { minDx = dx; nearest = pts[i]; nearestIdx = i }
    }
    // show tooltip if within reasonable distance
    if (minDx > (rect.width * devicePixelRatio) / (pts.length * 0.9)) {
      setTooltip(null)
      return
    }
    const displayLabel = nearest.label || (nearest.meta && nearest.meta._id) || ''
    setTooltip({ left: rect.left + (nearest.x / devicePixelRatio), top: rect.top + (nearest.y / devicePixelRatio), label: displayLabel, value: nearest.value, idx: nearestIdx })
  }

  const handleChartMouseLeave = () => setTooltip(null)

  function handlePreset(preset) {
    setActiveFilterPreset(preset)
    const now = new Date()

    if (preset === 'today') {
      const today = getLocalDateStr(now)
      setStartDate(today)
      setEndDate(today)
      setGlobalDateFilter({ startDate: today, endDate: today, preset: 'today' })
    } else if (preset === '7days') {
      const past = new Date()
      past.setDate(now.getDate() - 6)
      const s = getLocalDateStr(past)
      const e = getLocalDateStr(now)
      setStartDate(s)
      setEndDate(e)
      setGlobalDateFilter({ startDate: s, endDate: e, preset: '7days' })
    } else if (preset === '30days') {
      const past = new Date()
      past.setDate(now.getDate() - 29)
      const s = getLocalDateStr(past)
      const e = getLocalDateStr(now)
      setStartDate(s)
      setEndDate(e)
      setGlobalDateFilter({ startDate: s, endDate: e, preset: '30days' })
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const s = getLocalDateStr(firstDay)
      const e = getLocalDateStr(now)
      setStartDate(s)
      setEndDate(e)
      setGlobalDateFilter({ startDate: s, endDate: e, preset: 'thisMonth' })
    } else if (preset === 'all') {
      setStartDate('')
      setEndDate('')
      setGlobalDateFilter({ startDate: '', endDate: '', preset: 'all' })
    }
  }

  const totalPeriodRevenue = daily.reduce((sum, d) => sum + (d.totalRevenue || 0), 0)
  const totalPeriodItems = daily.reduce((sum, d) => sum + (d.totalItems || 0), 0)
  const totalPeriodOrders = recentOrders.length
  const maxDayRevenue = daily.length > 0 ? Math.max(...daily.map(d => d.totalRevenue || 0)) : 1
  const grossRevenue = Number(financialSummary.grossRevenue || 0)
  const totalRefunds = Number(financialSummary.totalRefunds || 0)
  const displayedRevenue = Number(financialSummary.netRevenue || 0)

  return (
    <div className="page-wrapper">
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={22} strokeWidth={2.1} /> Sales & Analytics Dashboard</h1>
          <p className="page-subtitle">Track daily and monthly revenue, transaction count, and sales trends</p>
        </div>

        {/* Date Filter Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-surface)', padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarDays size={14} /> Date Range:</span>
            <input
              type="date"
              className="form-input"
              style={{ width: 140, padding: '4px 8px', fontSize: '0.85rem' }}
              value={startDate}
              onChange={e => {
                setActiveFilterPreset('custom')
                setStartDate(e.target.value)
                setGlobalDateFilter({ startDate: e.target.value, endDate, preset: 'custom' })
              }}
              title="Start Date"
            />
            <span style={{ color: 'var(--text-muted)' }}>to</span>
            <input
              type="date"
              className="form-input"
              style={{ width: 140, padding: '4px 8px', fontSize: '0.85rem' }}
              value={endDate}
              onChange={e => {
                setActiveFilterPreset('custom')
                setEndDate(e.target.value)
                setGlobalDateFilter({ startDate, endDate: e.target.value, preset: 'custom' })
              }}
              title="End Date"
            />
            {(startDate || endDate) && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                onClick={() => {
                  const next = resetGlobalDateFilterToToday()
                  setActiveFilterPreset(next.preset)
                  setStartDate(next.startDate)
                  setEndDate(next.endDate)
                }}
                title="Reset to today"
              >
                Clear
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              onClick={() => fetchReports(startDate, endDate)}
              disabled={loading}
            >
              <RefreshCw size={14} /> Apply
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '4px 10px', fontSize: '0.8rem', marginLeft: 6 }}
              onClick={() => setShowStockModal(true)}
              title="လက်ကျန်စာရင်း (Stock Balance)"
            >
              <Boxes size={14} /> Stock Balance
            </button>
          </div>

          {/* Quick Filter Presets */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: '7days', label: 'Last 7 Days' },
              { id: '30days', label: 'Last 30 Days' },
              { id: 'thisMonth', label: 'This Month' }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${activeFilterPreset === p.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                onClick={() => handlePreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="stats-grid">
        <button
          type="button"
          className="stat-card"
          onClick={openNetBreakdownModal}
          style={{ textAlign: 'left', cursor: 'pointer' }}
          title="View net revenue breakdown"
        >
          <div className="stat-icon primary"><Wallet size={24} strokeWidth={2} /></div>
          <div>
            <div className="stat-val">{displayedRevenue.toLocaleString()} Ks</div>
            <div className="stat-lbl">
              {startDate || endDate ? 'FILTERED REVENUE (NET)' : 'TOTAL REVENUE (NET)'}
            </div>
          </div>
        </button>

        <div className="stat-card success">
          <div className="stat-icon success"><ShoppingBag size={24} strokeWidth={2} /></div>
          <div>
            <div className="stat-val">{totalPeriodItems.toLocaleString()} pcs</div>
            <div className="stat-lbl">Total Items Sold</div>
          </div>
        </div>

        <div className="stat-card warning">
          <div className="stat-icon warning"><ReceiptText size={24} strokeWidth={2} /></div>
          <div>
            <div className="stat-val">{totalPeriodOrders}</div>
            <div className="stat-lbl">Total Transactions</div>
          </div>
        </div>

        <button
          type="button"
          className="stat-card secondary"
          onClick={openRefundDetailsModal}
          style={{ textAlign: 'left', cursor: 'pointer' }}
          title="View refunded orders and items"
        >
          <div className="stat-icon secondary"><Undo2 size={24} strokeWidth={2} /></div>
          <div>
            <div className="stat-val">{totalRefunds.toLocaleString()} Ks</div>
            <div className="stat-lbl">REFUND (returned amount)</div>
          </div>
        </button>
      </div>

      {/* Visual Revenue Trend Chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 className="card-title" style={{ marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} /> Daily Sales Trend</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Period: {trendPeriodLabel}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Live trend — updates every 5s</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Showing {daily.length} data points</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <canvas ref={chartRef} style={{ width: '100%', height: 160, borderRadius: 8, display: 'block' }} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave} />
            {tooltip && (
              <div style={{ position: 'fixed', left: tooltip.left + 12, top: tooltip.top - 28, background: 'rgba(2,6,23,0.95)', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: '0.85rem', pointerEvents: 'none', zIndex: 130 }}>
                <div style={{ fontWeight: 800 }}>{tooltip.label}</div>
                <div style={{ opacity: 0.9 }}>{Number(tooltip.value || 0).toLocaleString()} Ks</div>
              </div>
            )}
            {/* X-axis labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 0, marginTop: 8, overflow: 'hidden' }}>
              {(chartPoints.length > 0 ? chartPoints : Array.from({ length: 7 })).map((p, i) => (
                <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip' }}>
                  {p ? p.axisLabel : ''}
                </div>
              ))}
            </div>
          </div>
          <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{displayedRevenue.toLocaleString()} Ks</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Revenue (selected, net of refunds)</div>
            <div style={{ height: 1, background: 'var(--border-default)', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Transactions</div>
              <div style={{ fontWeight: 700 }}>{totalPeriodOrders}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Items Sold</div>
              <div style={{ fontWeight: 700 }}>{totalPeriodItems}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24 }}>
        {/* Daily Sales Breakdown */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className="card-title" style={{ marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><CalendarRange size={18} /> Daily Sales Breakdown</h3>
            <span className="badge badge-primary">{daily.length} Days Recorded</span>
          </div>

          {daily.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
              {startDate || endDate ? 'No sales found for the selected date range.' : 'No daily sales recorded yet.'}
            </p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: 'center' }}>Transactions</th>
                    <th style={{ textAlign: 'right' }}>Items Sold</th>
                    <th style={{ textAlign: 'right' }}>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((d) => (
                    <tr key={d._id}>
                      <td>
                        <strong>{d._id}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-neutral">{Number(d.orderCount || 0)}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="badge badge-neutral">{Number(d.totalItems || 0)} pcs</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                        {Number(d.totalRevenue || 0).toLocaleString()} Ks
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Monthly Sales Breakdown */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className="card-title" style={{ marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><PieChart size={18} /> Monthly Sales Breakdown</h3>
            <span className="badge badge-success">{monthly.length} Months</span>
          </div>

          {monthly.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
              {startDate || endDate ? 'No sales found for the selected date range.' : 'No monthly sales recorded yet.'}
            </p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign: 'center' }}>Transactions</th>
                    <th style={{ textAlign: 'right' }}>Items Sold</th>
                    <th style={{ textAlign: 'right' }}>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m._id}>
                      <td>
                        <strong>{m._id}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-neutral">{Number(m.orderCount || 0)}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="badge badge-neutral">{Number(m.totalItems || 0)} pcs</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>
                        {Number(m.totalRevenue || 0).toLocaleString()} Ks
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showRefundDetailsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 125 }}>
          <div style={{ width: '92%', maxWidth: 1080, maxHeight: '86%', overflow: 'auto', background: 'var(--bg-surface)', borderRadius: 10, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Undo2 size={18} /> Refund Details</h3>
              <button className="btn btn-ghost" onClick={() => setShowRefundDetailsModal(false)}><X size={16} /> Close</button>
            </div>

            {refundDetailsLoading ? (
              <div style={{ padding: 18, color: 'var(--text-muted)' }}>Loading refund details...</div>
            ) : refundDetails.length === 0 ? (
              <div style={{ padding: 18, color: 'var(--text-muted)' }}>No refunds in the selected date range.</div>
            ) : (
              <div>
                <div style={{ marginBottom: 12, fontWeight: 700 }}>
                  Total Refunded: {refundDetails.reduce((s, r) => s + Number(r.refundAmount || 0), 0).toLocaleString()} Ks
                </div>
                <div className="table-responsive" style={{ maxHeight: '62vh', overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Refund Date</th>
                        <th>Order ID</th>
                        <th>Payment</th>
                        <th>Items</th>
                        <th style={{ textAlign: 'right' }}>Refund Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refundDetails.map((row, idx) => (
                        <tr key={`${row.saleId || 'sale'}-${idx}`}>
                          <td>{row.refundDate ? new Date(row.refundDate).toLocaleString() : '-'}</td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{row.receiptNumber || row.saleId || '-'}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{row.customerName || 'Walk-in / In-Store'}</div>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>{row.paymentMethod || 'cash'}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {(row.items || []).map((it, i) => (
                                <div key={i} style={{ fontSize: '0.83rem' }}>
                                  {it.title || it.sku || 'Item'} x {Number(it.qty || 0)}
                                  <span style={{ color: 'var(--text-muted)' }}> ({Number(it.subtotal || (Number(it.unitPrice || 0) * Number(it.qty || 0))).toLocaleString()} Ks)</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{Number(row.refundAmount || 0).toLocaleString()} Ks</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showNetBreakdownModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 126 }}>
          <div style={{ width: '92%', maxWidth: 980, maxHeight: '86%', overflow: 'auto', background: 'var(--bg-surface)', borderRadius: 10, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Wallet size={18} /> Net Revenue Breakdown</h3>
              <button className="btn btn-ghost" onClick={() => setShowNetBreakdownModal(false)}><X size={16} /> Close</button>
            </div>

            {netBreakdownLoading ? (
              <div style={{ padding: 18, color: 'var(--text-muted)' }}>Loading breakdown...</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
                  <div className="card" style={{ padding: 12 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gross Sales</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{Number(netBreakdown.grossRevenue || 0).toLocaleString()} Ks</div>
                  </div>
                  <div className="card" style={{ padding: 12 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Refunds</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#ef4444' }}>- {Number(netBreakdown.totalRefunds || 0).toLocaleString()} Ks</div>
                  </div>
                  <div className="card" style={{ padding: 12 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Net Revenue</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-primary)' }}>{Number(netBreakdown.netRevenue || 0).toLocaleString()} Ks</div>
                  </div>
                </div>

                <h4 style={{ marginBottom: 8 }}>Payment Method Breakdown</h4>
                <div className="table-responsive" style={{ maxHeight: '48vh', overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th style={{ textAlign: 'center' }}>Transactions</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(netBreakdown.paymentBreakdown || []).map((row, idx) => (
                        <tr key={`${row.method || 'method'}-${idx}`}>
                          <td style={{ textTransform: row.method === 'cash' ? 'uppercase' : 'none' }}>{row.method || 'cash'}</td>
                          <td style={{ textAlign: 'center' }}>{Number(row.count || 0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(row.amount || 0).toLocaleString()} Ks</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stock Balance Modal */}
      {showStockModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div style={{ width: '88%', maxWidth: 980, maxHeight: '86%', overflow: 'auto', background: 'var(--bg-surface)', borderRadius: 10, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Boxes size={18} /> လက်ကျန်စာရင်း • Stock Balance</h3>
                <div ref={stockFilterBtnRef} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    className={`btn btn-sm ${stockAllTime ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setStockAllTime(true); setStockFilterOpen(false); fetchStockList() }}
                    title="All Time"
                    style={{ padding: '6px 8px' }}
                  >All Time</button>
                  <button
                    className={`btn btn-sm ${!stockAllTime ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setStockAllTime(false); setStockFilterOpen(s => !s) }}
                    title="Custom date range"
                    style={{ padding: '6px 8px' }}
                  >Date Range</button>
                </div>

                {stockFilterOpen && !stockAllTime && (
                  <div ref={stockFilterPanelRef} style={{ marginTop: 6, padding: 10, background: 'var(--bg-elevated)', borderRadius: 8, boxShadow: '0 6px 18px rgba(2,6,23,0.6)', display: 'flex', gap: 8, alignItems: 'center', zIndex: 140 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="date" className="form-input" value={stockStartDate} onChange={e => setStockStartDate(e.target.value)} />
                      <input type="time" className="form-input" value={stockStartTime} onChange={e => setStockStartTime(e.target.value)} />
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>to</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="date" className="form-input" value={stockEndDate} onChange={e => setStockEndDate(e.target.value)} />
                      <input type="time" className="form-input" value={stockEndTime} onChange={e => setStockEndTime(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { resetStockFilters(); fetchStockList(); setStockFilterOpen(false) }}>Reset</button>
                      <button className="btn btn-primary btn-sm" onClick={() => { fetchStockList(); setStockFilterOpen(false) }}>Apply</button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>{stockTotals.totalQty} pcs</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Quantity</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>{stockTotals.totalValue.toLocaleString()} Ks</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Valuation</div>
                </div>
                <button className="btn btn-ghost" onClick={() => setShowStockModal(false)}><X size={16} /> Close</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                placeholder="Search product name or SKU..."
                className="form-input"
                value={stockQuery}
                onChange={e => setStockQuery(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={() => { setStockQuery(''); resetStockFilters(); fetchStockList() }}>Reset</button>
            </div>

            {stockLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading stock...</div>
            ) : (
              <div>
                <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th style={{ textAlign: 'right' }}>Stock</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th style={{ textAlign: 'right' }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stockList || []).filter(r => {
                        const q = (stockQuery || '').trim().toLowerCase()
                        if (!q) return true
                        return (r.title || '').toLowerCase().includes(q) || (r.sku || '').toLowerCase().includes(q)
                      }).map((r, i) => (
                        <tr key={i}>
                          <td style={{ maxWidth: 360 }}><strong>{r.title}</strong></td>
                          <td>{r.sku}</td>
                          <td style={{ textAlign: 'right' }}>{r.stock}</td>
                          <td style={{ textAlign: 'right' }}>{Number(r.price || 0).toLocaleString()} Ks</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{(Number(r.price || 0) * Number(r.stock || 0)).toLocaleString()} Ks</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
