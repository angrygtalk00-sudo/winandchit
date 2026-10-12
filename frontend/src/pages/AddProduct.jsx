import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { PencilLine, Plus, Search, Package2, Sparkles, Printer, Camera, Trash2, ImageUp, FileText, Palette, X, Save } from 'lucide-react'
import { ColorSwatch, getColorHex } from '../utils/colors'
import { notifyProductDeleted, notifyProductUpdated } from '../utils/productUpdates'
import { normalizeYouTubeEmbedUrl } from '../utils/youtube.mjs'

// NOTE: Inline add-subcategory removed — sub-categories are managed centrally in Settings.

const DEFAULT_ATTRIBUTES = [
  {
    name: 'Color',
    options: ['Black', 'White', 'Red', 'Blue', 'Navy Blue', 'Sky Blue', 'Green', 'Olive Green', 'Yellow', 'Pink', 'Purple', 'Grey', 'Brown', 'Beige', 'Maroon', 'Khaki', 'Pattern / Multi']
  },
  {
    name: 'Size',
    options: ['Free Size', 'XS', 'S', 'M', 'L', 'XL', '2XL (XXL)', '3XL', '4XL', '28', '29', '30', '31', '32', '33', '34', '36', '38']
  }
]
export default function AddProduct() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Clothing',
    subCategory: '',
    youtubeUrl: '',
    virtualTryOnEnabled: true
  })
  const { title, description, category, subCategory, youtubeUrl, virtualTryOnEnabled } = form
  const updateForm = (updates) => setForm(prev => ({ ...prev, ...updates }))
  const [baseSkuNum, setBaseSkuNum] = useState(1)
  const [variants, setVariants] = useState([
    {
      sku: 'WC-0001',
      attributes: { 'Color': 'Black', 'Size': 'M' },
      customAttributes: {},
      price: '15000',
      stock: '10',
      imageFile: null,
      imagePreview: '',
      image: ''
    }
  ])
  const [mainImages, setMainImages] = useState([]) // Array of { file, preview }
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [generatingSkuIndex, setGeneratingSkuIndex] = useState(null)
  const [showStickerModal, setShowStickerModal] = useState(false)
  const [stickerVariantIdx, setStickerVariantIdx] = useState(null)
  const [stickerQuantity, setStickerQuantity] = useState(1)
  const [stickerSize, setStickerSize] = useState(() => {
    try { return localStorage.getItem('printStickerSize') || 'A4' } catch (e) { return 'A4' }
  })
  const barcodeRef = useRef(null)
  const [fitToPage, setFitToPage] = useState(false)

  // Load JsBarcode dynamically and render barcode in modal when opened
  useEffect(() => {
    if (!showStickerModal) return
    const v = variants[stickerVariantIdx]
    const sku = v?.sku || ''

    function renderBarcode() {
      try {
        if (window.JsBarcode && barcodeRef.current) {
          try { window.JsBarcode(barcodeRef.current, sku, { format: 'CODE128', lineColor: '#000', width: 1.2, height: 40, displayValue: false, margin: 0 }) } catch (e) {}
        }
      } catch (e) {}
    }

    if (typeof window !== 'undefined' && !window.JsBarcode) {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js'
      s.onload = () => setTimeout(renderBarcode, 50)
      document.head.appendChild(s)
    } else {
      setTimeout(renderBarcode, 50)
    }
  }, [showStickerModal, stickerVariantIdx, variants])

  // helper: escape HTML for print template
  function escapeHtml(str) {
    if (!str) return ''
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  // Fetch categories, products, and next SKU on mount
  const loadInitialData = () => {
    axios.get('/api/categories')
      .then(r => {
        if (r.data && r.data.length > 0) {
          // Ensure 'Clothing' is sorted first
          const sortedCats = [...r.data].sort((a, b) => {
            if (a.name.toLowerCase() === 'clothing') return -1
            if (b.name.toLowerCase() === 'clothing') return 1
            return a.name.localeCompare(b.name)
          })
          setCategories(sortedCats)
          if (!editingProductId) {
            updateForm({ category: sortedCats[0].name })
          }
        }
      })
      .catch(() => {})

    axios.get('/api/products')
      .then(r => setAllProducts(r.data || []))
      .catch(() => {})

    axios.get('/api/products/next-sku')
      .then(r => {
        if (r.data && r.data.nextNumber) {
          const num = r.data.nextNumber
          setBaseSkuNum(num)
          if (!editingProductId) {
            setVariants(prev => {
              if (prev.length === 1 && (prev[0].sku === 'WC-0001' || prev[0].sku.startsWith('SKU-'))) {
                return [{ ...prev[0], sku: `WC-${String(num).padStart(4, '0')}` }]
              }
              return prev
            })
          }
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  // Find active category configuration
  const currentCategoryObj = categories.find(c => c.name.toLowerCase() === category.toLowerCase())
  const subCategories = currentCategoryObj?.subcategories || []
  const activeAttributes = (currentCategoryObj?.attributes && currentCategoryObj.attributes.length > 0)
    ? currentCategoryObj.attributes
    : DEFAULT_ATTRIBUTES

  function selectCategory(nextCategory) {
    const nextCategoryObj = categories.find(item => item.name.toLowerCase() === nextCategory.toLowerCase())
    updateForm({
      category: nextCategory,
      subCategory: nextCategoryObj?.subcategories?.includes(subCategory) ? subCategory : ''
    })
  }

  // Helper to get or initialize a variant's attribute value
  function getVariantAttrValue(v, attrName, defaultOption) {
    if (v.attributes && v.attributes[attrName] !== undefined) {
      return v.attributes[attrName]
    }
    if (attrName.toLowerCase().includes('color') && v.color) return v.color
    if (attrName.toLowerCase().includes('size') && v.size) return v.size
    return defaultOption || ''
  }

  function updateVariantAttr(variantIdx, attrName, value) {
    setVariants(prev => prev.map((v, idx) => {
      if (idx !== variantIdx) return v
      const nextAttrs = { ...(v.attributes || {}) }
      nextAttrs[attrName] = value
      return { ...v, attributes: nextAttrs }
    }))
  }

  function updateVariantCustomAttr(variantIdx, attrName, customVal) {
    setVariants(prev => prev.map((v, idx) => {
      if (idx !== variantIdx) return v
      const nextCustom = { ...(v.customAttributes || {}) }
      nextCustom[attrName] = customVal
      return { ...v, customAttributes: nextCustom }
    }))
  }

  function updateVariant(i, key, val) {
    setVariants(v => v.map((x, idx) => (idx === i ? { ...x, [key]: val } : x)))
  }

  function handleVariantImageChange(i, file) {
    if (!file) return
    const preview = URL.createObjectURL(file)
    setVariants(v =>
      v.map((x, idx) =>
        idx === i ? { ...x, imageFile: file, imagePreview: preview, image: '' } : x
      )
    )
  }

  function removeVariantImage(i) {
    setVariants(v =>
      v.map((x, idx) =>
        idx === i ? { ...x, imageFile: null, imagePreview: '', image: '' } : x
      )
    )
  }

  function assignMainImageToVariant(variantIndex, imageUrlOrPreview, imageFile = null) {
    setVariants(v =>
      v.map((x, idx) => {
        if (idx !== variantIndex) return x
        if (imageFile) {
          return { ...x, imageFile, imagePreview: imageUrlOrPreview, image: '' }
        }
        return { ...x, imagePreview: imageUrlOrPreview, image: imageUrlOrPreview, imageFile: null }
      })
    )
  }

  function addVariant() {
    let maxSeq = baseSkuNum + variants.length - 1
    variants.forEach(v => {
      const match = v.sku?.match(/WC-(\d+)/i)
      if (match) {
        const n = parseInt(match[1], 10)
        if (!isNaN(n) && n > maxSeq) maxSeq = n
      }
    })
    const nextSeq = maxSeq + 1
    const newSku = `WC-${String(nextSeq).padStart(4, '0')}`

    const initialAttrs = {}
    activeAttributes.forEach(attr => {
      initialAttrs[attr.name] = attr.options?.[0] || 'Default'
    })

    setVariants(v => [
      ...v,
      {
        sku: newSku,
        attributes: initialAttrs,
        customAttributes: {},
        price: v[0]?.price || '15000',
        stock: '10',
        imageFile: null,
        imagePreview: '',
        image: ''
      }
    ])
  }

  function removeVariant(i) {
    if (variants.length <= 1) {
      alert('Product must have at least one variant')
      return
    }
    setVariants(v => v.filter((_, idx) => idx !== i))
  }

  function handleMainFiles(e) {
    const files = Array.from(e.target.files || [])
    const newItems = files.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }))
    setMainImages(prev => [...prev, ...newItems])
  }

  function removeMainImage(index) {
    setMainImages(prev => prev.filter((_, idx) => idx !== index))
  }

  // Load existing product for editing
  function loadProductToEdit(prod) {
    setEditingProductId(prod._id)
    setForm({
      title: prod.title || '',
      description: prod.description || '',
      category: prod.category || 'Clothing',
      subCategory: prod.subCategory || '',
      youtubeUrl: prod.youtubeUrl || prod.videoUrl || '',
      virtualTryOnEnabled: prod.virtualTryOnEnabled !== false
    })

    const loadedMainImages = (prod.images || []).map(imgUrl => ({
      file: null,
      preview: imgUrl
    }))
    setMainImages(loadedMainImages)

    const loadedVariants = (prod.variants || []).map(v => ({
      sku: v.sku || '',
      attributes: v.attributes || { Color: v.color || '', Size: v.size || '' },
      customAttributes: {},
      price: String(v.price || 0),
      stock: String(v.stock || 0),
      imageFile: null,
      imagePreview: v.image || '',
      image: v.image || ''
    }))

    setVariants(loadedVariants.length ? loadedVariants : [
      {
        sku: 'WC-0001',
        attributes: { 'Color': 'Black', 'Size': 'M' },
        customAttributes: {},
        price: '15000',
        stock: '10',
        imageFile: null,
        imagePreview: '',
        image: ''
      }
    ])

    setShowSearchDropdown(false)
    setProductSearchQuery('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Reset form to Add New Product
  function resetForm() {
    setEditingProductId(null)
    setForm({
      title: '',
      description: '',
      category: categories[0]?.name || 'Clothing',
      subCategory: '',
      youtubeUrl: '',
      virtualTryOnEnabled: true
    })
    setMainImages([])
    setProductSearchQuery('')
    setShowSearchDropdown(false)

    axios.get('/api/products/next-sku')
      .then(r => {
        const nextSku = r.data?.nextSku || 'WC-0001'
        setVariants([
          {
            sku: nextSku,
            attributes: { 'Color': 'Black', 'Size': 'M' },
            customAttributes: {},
            price: '15000',
            stock: '10',
            imageFile: null,
            imagePreview: '',
            image: ''
          }
        ])
      })
      .catch(() => {
        setVariants([
          {
            sku: 'WC-0001',
            attributes: { 'Color': 'Black', 'Size': 'M' },
            customAttributes: {},
            price: '15000',
            stock: '10',
            imageFile: null,
            imagePreview: '',
            image: ''
          }
        ])
      })
  }

  // Archive the product while preserving sales history.
  async function handleDeleteProduct() {
    if (!editingProductId) return
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${title}"?\n\n• The product will be removed from Catalog and POS.\n• Its hosted photos will be permanently deleted.\n• Previous sales records and analytics will be safely preserved.`
    )
    if (!confirmDelete) return

    setDeleting(true)
    try {
      const response = await axios.delete(`/api/products/${editingProductId}`)
      notifyProductDeleted(editingProductId)
      alert(response.data?.imageCleanupFailures
        ? `Product archived, but ${response.data.imageCleanupFailures} hosted image(s) could not be deleted.`
        : 'Product archived and hosted photos deleted successfully.')
      resetForm()
      loadInitialData()
    } catch (err) {
      console.error(err)
      alert('Delete failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setDeleting(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return alert('Please enter product title')
    if (variants.some(v => !v.sku.trim())) return alert('All variants must have a valid SKU')

    setSaving(true)
    try {
      // 1. Prepare files to upload in a single batch
      const fd = new FormData()
      
      const mainImageIndices = []
      const variantImageIndices = {}
      const fileUploadIndices = new Map()
      let uploadCounter = 0
      const registerImageFile = (file) => {
        if (fileUploadIndices.has(file)) return fileUploadIndices.get(file)
        const uploadIdx = uploadCounter++
        fd.append('images', file)
        fileUploadIndices.set(file, uploadIdx)
        return uploadIdx
      }

      // Add main photos
      mainImages.forEach((imgObj, idx) => {
        if (imgObj.file) {
          mainImageIndices.push({ listIndex: idx, uploadIdx: registerImageFile(imgObj.file) })
        }
      })

      // Add variant photos
      variants.forEach((v, vIdx) => {
        if (v.imageFile) {
          variantImageIndices[vIdx] = registerImageFile(v.imageFile)
        }
      })

      let uploadedUrls = []
      if (uploadCounter > 0) {
        const up = await axios.post('/api/products/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000
        })
        uploadedUrls = up.data.uploaded || []
      }

      // 2. Map uploaded URLs to main images
      const finalMainImages = mainImages.map((imgObj, idx) => {
        const mapping = mainImageIndices.find(m => m.listIndex === idx)
        if (mapping && uploadedUrls[mapping.uploadIdx]) {
          return uploadedUrls[mapping.uploadIdx]
        }
        return imgObj.preview // if it's already a URL
      }).filter(url => typeof url === 'string' && url.startsWith('http'))

      // 3. Map uploaded URLs to variants & assemble dynamic attributes
      const finalVariants = variants.map((v, vIdx) => {
        let variantImgUrl = v.image || ''
        if (variantImageIndices[vIdx] !== undefined && uploadedUrls[variantImageIndices[vIdx]]) {
          variantImgUrl = uploadedUrls[variantImageIndices[vIdx]]
        } else if (!variantImgUrl && v.imagePreview && v.imagePreview.startsWith('http')) {
          variantImgUrl = v.imagePreview
        }

        // If no variant image is set, fall back to the first main image if available
        if (!variantImgUrl && finalMainImages.length > 0) {
          variantImgUrl = finalMainImages[0]
        }

        // Resolve dynamic attributes
        const finalAttrs = {}
        activeAttributes.forEach(attr => {
          const selectedVal = v.attributes?.[attr.name] || attr.options?.[0] || 'Default'
          if (selectedVal === 'Custom') {
            finalAttrs[attr.name] = v.customAttributes?.[attr.name]?.trim() || 'Custom'
          } else {
            finalAttrs[attr.name] = selectedVal
          }
        })

        // Derive primary and secondary attribute for legacy compatibility
        const attrKeys = Object.keys(finalAttrs)
        const primaryVal = attrKeys[0] ? finalAttrs[attrKeys[0]] : ''
        const secondaryVal = attrKeys[1] ? finalAttrs[attrKeys[1]] : ''

        return {
          sku: v.sku.trim(),
          color: primaryVal,
          size: secondaryVal,
          attributes: finalAttrs,
          price: v.price === '' ? 0 : Math.max(0, Number(v.price) || 0),
          stock: v.stock === '' ? 0 : Math.max(0, parseInt(v.stock, 10) || 0),
          image: variantImgUrl
        }
      })

      const trimmedYoutubeUrl = String(form.youtubeUrl || '').trim()
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        subCategory: subCategory.trim(),
        youtubeUrl: trimmedYoutubeUrl,
        virtualTryOnEnabled,
        variants: finalVariants,
        images: finalMainImages
      }
      // promotions are managed from the Discounts page; not attached here

      async function saveProductOnce() {
        if (editingProductId) {
          return axios.put(`/api/products/${editingProductId}`, payload, { timeout: 120000 })
        }
        return axios.post('/api/products', payload, { timeout: 120000 })
      }

      console.log('Final Payload:', form)
      console.log('API request payload:', payload)
      let savedProduct
      try {
        savedProduct = await saveProductOnce()
      } catch (saveErr) {
        // Retry once for transient timeout/network errors
        const isTimeout = saveErr?.code === 'ECONNABORTED' || (saveErr?.message || '').toLowerCase().includes('timeout')
        const isNetwork = !saveErr?.response
        if (isTimeout || isNetwork) {
          try {
            savedProduct = await saveProductOnce()
          } catch (secondErr) {
            throw secondErr
          }
        } else {
          throw saveErr
        }
      }

      notifyProductUpdated(savedProduct.data?._id || editingProductId, !editingProductId)
      if (Number(savedProduct.data?.imageCleanupFailures || 0) > 0) {
        alert(`${savedProduct.data.imageCleanupFailures} removed hosted image(s) could not be deleted.`)
      }
      setSavedSuccess(true)
      setTimeout(() => {
        navigate('/')
      }, 1200)
    } catch (err) {
      console.error(err)
      alert('Save failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setSaving(false)
    }
  }

  // Sticker print logic for Add Product: show modal preview and print preview
  function renderStickerModal() {
    if (!showStickerModal || stickerVariantIdx === null) return null
    const v = variants[stickerVariantIdx]
    const titleText = title || 'Product'
    const skuText = v?.sku || ''
    const priceText = v?.price ? Number(v.price).toLocaleString() + ' Ks' : ''
    const colorVal = v?.color || v?.attributes?.Color || ''
    const sizeVal = v?.size || v?.attributes?.Size || ''

    // render-friendly dimensions
    const stickerDimensions = (() => {
      switch (stickerSize) {
        case 'Label-60x30': return { w: '60mm', h: '30mm' }
        case 'Label-40x20': return { w: '40mm', h: '20mm' }
        case 'A5': return { w: '148mm', h: '210mm' }
        default: return { w: '210mm', h: '297mm' } // A4
      }
    })()

    return (
      <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: 18, width: 720, maxWidth: '95vw' }}>
          <h3 style={{ marginTop: 0 }}>Sticker Preview</h3>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ width: 220, border: '1px solid #000', padding: 10, background: '#fff', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center', boxSizing: 'border-box' }}>
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', lineHeight: 1.1 }}>{titleText}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.78rem', color: '#111', textAlign: 'left', lineHeight: 1 }}>{colorVal ? `Color: ${colorVal}` : ''}</div>
                  <div style={{ fontSize: '0.78rem', color: '#111', textAlign: 'right', lineHeight: 1 }}>{sizeVal ? `Size: ${sizeVal}` : ''}</div>
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, margin: '6px 0' }}>{priceText}</div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', flexDirection: 'column' }}>
                <svg ref={barcodeRef} className="modal-barcode" style={{ width: '100%', height: 38, display: 'block' }} />
                <div style={{ fontSize: '11px', marginTop: 6, fontWeight: 700 }}>{skuText}</div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ marginBottom: 8 }}>
                  <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Copies</label>
                  <input type="number" min={1} className="form-input" value={stickerQuantity} onChange={e => setStickerQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))} style={{ height: 30, padding: '4px 8px', width: 96 }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Sticker Size</label>
                  <select className="form-select" value={stickerSize} onChange={e => { setStickerSize(e.target.value); try { localStorage.setItem('printStickerSize', e.target.value) } catch (err) {} }} style={{ height: 30, padding: '4px 8px', width: 220 }}>
                    <option value="A4">A4 (210 x 297 mm)</option>
                    <option value="A5">A5 (148 x 210 mm)</option>
                    <option value="Label-30x20">30 x 20 mm</option>
                    <option value="Label-40x20">40 x 20 mm</option>
                    <option value="Label-40x30">40 x 30 mm</option>
                    <option value="Label-50x30">50 x 30 mm</option>
                    <option value="Label-60x30">60 x 30 mm</option>
                    <option value="Label-60x40">60 x 40 mm</option>
                    <option value="Label-70x50">70 x 50 mm</option>
                    <option value="Label-100x100">100 x 100 mm</option>
                  </select>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input id="fitToPage" type="checkbox" checked={fitToPage} onChange={e => setFitToPage(e.target.checked)} />
                    <label htmlFor="fitToPage" style={{ fontSize: '0.85rem' }}>Fit to standard page (scale sticker when thermal size unavailable)</label>
                  </div>
                </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Preview shows one sticker; printed output will repeat the sticker for the number of copies selected and arrange based on chosen label size.
              </div>
            </div>
          </div>
          <style>{`
            .modal-barcode{width:100%;height:48px}
          `}</style>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowStickerModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => {
              // persist size
              try { localStorage.setItem('printStickerSize', stickerSize) } catch (e) {}

              // map stickerSize to exact mm dimensions
              const stickerDim = (function() {
                switch (stickerSize) {
                  case 'Label-30x20': return { w: '30mm', h: '20mm' }
                  case 'Label-40x20': return { w: '40mm', h: '20mm' }
                  case 'Label-40x30': return { w: '40mm', h: '30mm' }
                  case 'Label-50x30': return { w: '50mm', h: '30mm' }
                  case 'Label-60x30': return { w: '60mm', h: '30mm' }
                  case 'Label-60x40': return { w: '60mm', h: '40mm' }
                  case 'Label-70x50': return { w: '70mm', h: '50mm' }
                  case 'Label-100x100': return { w: '100mm', h: '100mm' }
                  case 'A5': return { w: '148mm', h: '210mm' }
                  default: return { w: '210mm', h: '297mm' } // A4
                }
              })()

              // Build print HTML: each sticker is its own page sized to the sticker dimensions
              const stickerHtml = `<div class="sticker" data-sku="${escapeHtml(skuText)}">
  <div class="title">${escapeHtml(titleText)}</div>
  <div class="attrs"><span class="color">${escapeHtml(colorVal)}</span><span class="size">${escapeHtml(sizeVal)}</span></div>
  <div class="price">${escapeHtml(priceText)}</div>
  <svg class="barcode" data-sku="${escapeHtml(skuText)}"></svg>
  <div class="code">${escapeHtml(skuText)}</div>
</div>`

              const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Print Stickers</title>
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<style>
  /* If fitToPage is true, we do not rely on custom page size; instead scale sticker to fit a standard page */
  ${fitToPage ? `
  @page { size: auto; margin: 6mm; }
  html,body{height:100%;margin:0;padding:0}
  body{display:flex;flex-direction:row;flex-wrap:wrap;align-items:flex-start;justify-content:flex-start;background:#fff}
  .sticker{box-sizing:border-box;border:1px solid #000;padding:6px;margin:4mm; width:calc(min(40mm, ${stickerDim.w})); height:calc(min(40mm, ${stickerDim.h})); display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center; transform: scale(1); }
  .sticker{page-break-inside:avoid}
  ` : `
  @page { size: ${stickerDim.w} ${stickerDim.h}; margin: 0 }
  html,body{height:100%;margin:0;padding:0}
  body{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;background:#fff}
  .sticker{box-sizing:border-box;border:1px solid #000;padding:6px;margin:0 auto; width:${stickerDim.w}; height:${stickerDim.h}; display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center}
  .sticker{page-break-after:always}
  `}
  .title{font-weight:700;font-size:12px;text-transform:uppercase}
  .attrs{width:100%;display:flex;justify-content:space-between;font-size:10px;margin-top:4px}
  .attrs .color{text-align:left}
  .attrs .size{text-align:right}
  .price{font-weight:800;font-size:14px;margin-top:6px}
  .barcode{width:100%;height:32px}
  .code{font-weight:700;font-size:11px;margin-top:4px}
  @media print{html,body{height:auto} .no-print{display:none}}
</style>
</head><body>
${Array.from({length: stickerQuantity}).map(()=>stickerHtml).join('')}
<script>
  function runBarcodes(){
    const svgs = document.querySelectorAll('svg.barcode');
    svgs.forEach(s => {
      const sku = s.getAttribute('data-sku') || '';
      try{ JsBarcode(s, sku, {format:'CODE128',lineColor:'#000',width:1.2,height:40,displayValue:false,margin:0}) }catch(e){}
    })
  }
  window.onload=function(){ runBarcodes(); setTimeout(()=>window.print(),200) }
</script>
</body></html>`

              const w = window.open('', '_blank')
              if (w) { w.document.open(); w.document.write(html); w.document.close(); }
              setShowStickerModal(false)
            }}>Print</button>
          </div>
        </div>
      </div>
    )
  }

  // Format variant descriptor label for helper previews
  function getVariantLabel(v, idx) {
    if (v.attributes && Object.keys(v.attributes).length > 0) {
      return Object.entries(v.attributes)
        .map(([k, val]) => `${val === 'Custom' ? (v.customAttributes?.[k] || 'Custom') : val}`)
        .join(' / ')
    }
    return `Variant #${idx + 1}`
  }

  // Filter existing products for search bar
  const searchResults = allProducts.filter(p => {
    if (!productSearchQuery.trim()) return false
    const q = productSearchQuery.toLowerCase()
    return (
      p.title?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.variants?.some(v => v.sku?.toLowerCase().includes(q) || v.color?.toLowerCase().includes(q))
    )
  })

  return (
    <div className="page-wrapper" style={{ maxWidth: 1060 }}>
      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{editingProductId ? <PencilLine size={21} /> : <Plus size={21} />} {editingProductId ? 'Edit Product' : 'Add New Product'}</span>
          </h1>
          <p className="page-subtitle">
            Create items with dynamic category attributes, variant photos, sequential SKUs, and stock
          </p>
        </div>

        {editingProductId && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetForm}
            >
              <Plus size={16} /> Create New Product Instead
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteProduct}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : <><Trash2 size={16} /> Delete Product</>}
            </button>
          </div>
        )}
      </div>

      {/* Product Search & Edit Bar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 20, background: 'var(--bg-surface-alt)', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }}><Search size={18} /></span>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search existing products to edit or manage (type title, SKU like WC-0001, or color)..."
              value={productSearchQuery}
              onChange={e => {
                setProductSearchQuery(e.target.value)
                setShowSearchDropdown(true)
              }}
            />
            {showSearchDropdown && productSearchQuery.trim() && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 50,
                marginTop: 4,
                maxHeight: 280,
                overflowY: 'auto'
              }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No matching products found.
                  </div>
                ) : (
                  searchResults.map(p => (
                    <div
                      key={p._id}
                      onClick={() => loadProductToEdit(p)}
                      style={{
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-subtle)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {p.images?.[0] ? (
                            <img src={p.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Package2 size={16} />
                          )}
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.9rem', display: 'block' }}>{p.title}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {p.category || 'Clothing'} • {p.variants?.length || 0} variants ({p.variants?.map(v => v.sku).join(', ')})
                          </span>
                        </div>
                      </div>
                      <span className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                        <PencilLine size={13} /> Edit This
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {editingProductId && (
            <span className="badge badge-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
              Editing Mode
            </span>
          )}
        </div>
      </div>

      {savedSuccess && (
        <div className="card" style={{ background: 'var(--color-success-light)', borderColor: '#a7f3d0', marginBottom: 20, textAlign: 'center' }}>
          <h3 style={{ color: 'var(--color-success)', marginBottom: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Sparkles size={18} /> Product {editingProductId ? 'Updated' : 'Added'} Successfully!</span>
          </h3>
          <p style={{ color: '#065f46', fontSize: '0.9rem' }}>Redirecting to Catalog...</p>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Basic Details Card */}
        <div className="card">
          <h3 className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><FileText size={18} /> Basic Information</h3>

          <div className="form-group">
            <label className="form-label">Product Name / Title *</label>
            <input
              className="form-input"
              placeholder="e.g., Tea Tree Facial Cleanser, Men's Cotton T-Shirt, Matte Velvet Lipstick"
              value={title}
              onChange={e => updateForm({ title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 6 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Category & Variant Attributes</label>
            </div>

            <input
              className="form-input"
              placeholder="Select or type category..."
              value={category}
              onChange={e => selectCategory(e.target.value)}
            />

            {/* Category selection buttons: "Clothing" is placed first */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {categories.map(cat => (
                <button
                  type="button"
                  key={cat._id}
                  className={`btn btn-sm ${category.toLowerCase() === cat.name.toLowerCase() ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  onClick={() => selectCategory(cat.name)}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <label className="form-label" style={{ marginBottom: 6 }}>Sub-category</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="form-select" value={subCategory} onChange={event => updateForm({ subCategory: event.target.value })} style={{ flex: 1 }}>
                  <option value="">Select sub-category</option>
                  {subCategories.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              {(!subCategories || subCategories.length === 0) && (
                <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>No sub-categories yet. You can add one using the + button.</div>
              )}
            </div>

            <div style={{ marginTop: 10, background: 'var(--bg-surface-subtle)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              <span>Active Attributes for <strong>{category}</strong>: </span>
              <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                {activeAttributes.map(a => a.name).join(' + ')}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">YouTube Video URL / Embed</label>
            <input
              className="form-input"
              placeholder="https://www.youtube.com/watch?v=... or full iframe embed code"
              value={form.youtubeUrl || ''}
              onChange={(e) => {
                const nextForm = { ...form, youtubeUrl: e.target.value }
                setForm(nextForm)
                console.log('YouTube input changed:', e.target.value)
                console.log('Updated form state:', nextForm)
              }}
            />
            {normalizeYouTubeEmbedUrl(form.youtubeUrl || '') && (
              <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Preview embed: <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{normalizeYouTubeEmbedUrl(form.youtubeUrl || '')}</span>
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Description (Optional)</label>
            <textarea
              className="form-textarea"
              placeholder="Add product details, ingredients, usage directions, or washing instructions..."
              value={description}
              onChange={e => updateForm({ description: e.target.value })}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 16, padding: '12px 14px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', cursor: 'pointer' }}>
            <span><strong style={{ display: 'block', color: 'var(--text-primary)' }}>Virtual Try-on</strong><small style={{ color: 'var(--text-muted)' }}>Allow customers to use AI Photo for this product.</small></span>
            <input type="checkbox" checked={virtualTryOnEnabled} onChange={event => updateForm({ virtualTryOnEnabled: event.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }} />
          </label>

          {/* Promotion controls removed from Add Product — managed on Discounts page */}
        </div>

        {/* Dynamic Variants with Specific Images & Optimized Column Widths */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 className="card-title" style={{ marginBottom: 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Palette size={18} /> Variants ({activeAttributes.map(a => a.name).join(' & ')})</span>
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Fields dynamically match the selected category ({category})
              </p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addVariant}>
              <Plus size={14} /> Add Another Variant
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 70, textAlign: 'center' }}>Photo</th>
                  <th style={{ width: 175, minWidth: 160 }}>SKU / Barcode *</th>
                  {/* Dynamic Category Attributes Headers (compact width) */}
                  {activeAttributes.map((attr, aIdx) => (
                    <th key={aIdx} style={{ width: aIdx === 0 ? 140 : 120, minWidth: aIdx === 0 ? 130 : 110 }}>
                      {attr.name}
                    </th>
                  ))}
                  <th style={{ width: 155, minWidth: 145 }}>Price (Ks) *</th>
                  <th style={{ width: 95, minWidth: 90 }}>Stock *</th>
                  <th style={{ width: 45, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v, i) => (
                  <tr key={i}>
                    {/* Variant Image Upload Column */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '6px' }}>
                      <div style={{ position: 'relative', width: 52, height: 52, margin: '0 auto' }}>
                        {v.imagePreview ? (
                          <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-default)', position: 'relative' }}>
                            <img
                              src={v.imagePreview}
                              alt={`Variant ${i}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <button
                              type="button"
                              onClick={() => removeVariantImage(i)}
                              title="Remove variant photo"
                              style={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                background: 'rgba(0,0,0,0.65)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '50%',
                                width: 16,
                                height: 16,
                                fontSize: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : (
                          <label
                            style={{
                              width: 52,
                              height: 52,
                              border: '2px dashed var(--border-strong)',
                              borderRadius: 'var(--radius-sm)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              background: 'var(--bg-surface-alt)',
                              fontSize: '0.65rem',
                              color: 'var(--text-muted)'
                            }}
                            title="Click to upload photo for this variant"
                          >
                            <span style={{ display: 'inline-flex' }}><Camera size={14} /></span>
                            <span>Photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={e => {
                                if (e.target.files?.[0]) {
                                  handleVariantImageChange(i, e.target.files[0])
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </td>

                    {/* SKU (Spacious Width) */}
                    <td>
                      <input
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.02em' }}
                        value={v.sku}
                        placeholder="WC-0001"
                        onChange={e => updateVariant(i, 'sku', e.target.value)}
                        required
                      />
                    </td>

                    {/* Dynamic Attributes Inputs with Color Swatch & Compact Width */}
                    {activeAttributes.map((attr, aIdx) => {
                      const currentVal = getVariantAttrValue(v, attr.name, attr.options?.[0])
                      const isCustom = currentVal === 'Custom' || (currentVal && !attr.options?.includes(currentVal))
                      const isColorField = attr.name.toLowerCase().includes('color') || attr.name.toLowerCase().includes('shade')
                      const hex = isColorField ? getColorHex(currentVal) : null

                      return (
                        <td key={aIdx}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {hex && <ColorSwatch color={currentVal} size={14} />}
                            <select
                              className="form-select"
                              style={{ padding: '6px 8px', fontSize: '0.85rem', flex: 1, minWidth: 0 }}
                              value={attr.options?.includes(currentVal) ? currentVal : 'Custom'}
                              onChange={e => updateVariantAttr(i, attr.name, e.target.value)}
                            >
                              {(attr.options || []).map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                              <option value="Custom">Custom...</option>
                            </select>
                          </div>

                          {isCustom && (
                            <input
                              className="form-input"
                              style={{ padding: '4px 6px', fontSize: '0.8rem', marginTop: 4 }}
                              placeholder={`Type ${attr.name.toLowerCase()}...`}
                              value={v.customAttributes?.[attr.name] || (!attr.options?.includes(currentVal) ? currentVal : '')}
                              onChange={e => updateVariantCustomAttr(i, attr.name, e.target.value)}
                              autoFocus
                            />
                          )}
                        </td>
                      )
                    })}

                    {/* Price (Spacious & Clean number input) */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          className="form-input"
                          style={{ padding: '6px 10px', fontSize: '0.875rem', fontWeight: 600 }}
                          value={v.price === undefined || v.price === null ? '' : v.price}
                          placeholder="0"
                          min="0"
                          onChange={e => updateVariant(i, 'price', e.target.value)}
                          required
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Ks</span>
                      </div>
                    </td>

                    {/* Stock (Clean number input) */}
                    <td>
                      <input
                        type="number"
                        className="form-input"
                        style={{ padding: '6px 8px', fontSize: '0.875rem' }}
                        value={v.stock === undefined || v.stock === null ? '' : v.stock}
                        placeholder="0"
                        min="0"
                        onChange={e => updateVariant(i, 'stock', e.target.value)}
                        required
                      />
                    </td>

                    {/* Delete Variant */}
                    <td style={{ textAlign: 'center', display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 8px' }}
                        title="Print sticker for this variant"
                        onClick={() => {
                          setStickerVariantIdx(i)
                          setStickerQuantity(1)
                          setShowStickerModal(true)
                        }}
                      >
                        <Printer size={14} />
                      </button>

                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        style={{ padding: '4px 8px' }}
                        onClick={() => removeVariant(i)}
                        title="Delete variant"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* General Product Gallery Images Card */}
        <div className="card">
          <h3 className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ImageUp size={18} /> General Product Gallery (Optional)</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            Upload main product photos or packaging shots. You can also click any uploaded photo below to assign it to a variant.
          </p>

          <label className="upload-dropzone" style={{ display: 'block' }}>
            <input
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleMainFiles}
            />
            <div style={{ marginBottom: 8, display: 'inline-flex', color: 'var(--color-primary)' }}><ImageUp size={28} /></div>
            <strong style={{ color: 'var(--color-primary)' }}>Click to upload gallery photos</strong>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
              PNG, JPG, WEBP formats supported (Auto-compressed to 5MB max)
            </div>
          </label>

          {mainImages.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Uploaded Photos ({mainImages.length}) — Click to quickly assign to a variant:
              </h4>
              <div className="image-preview-grid">
                {mainImages.map((imgObj, idx) => (
                  <div key={idx} className="image-preview-box" style={{ position: 'relative' }}>
                    <img src={imgObj.preview} alt="gallery preview" />
                    <button
                      type="button"
                      onClick={() => removeMainImage(idx)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: 20,
                        height: 20,
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Remove from gallery"
                    >
                      <X size={12} />
                    </button>

                    {/* Quick Assign Dropdown */}
                    <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4 }}>
                      <select
                        style={{
                          width: '100%',
                          fontSize: '0.7rem',
                          padding: '2px 4px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(255,255,255,0.95)',
                          border: '1px solid #ccc'
                        }}
                        onChange={e => {
                          const vIdx = parseInt(e.target.value)
                          if (!isNaN(vIdx)) {
                            assignMainImageToVariant(vIdx, imgObj.preview, imgObj.file)
                            e.target.value = ''
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Assign to Variant...</option>
                        {variants.map((v, vIdx) => (
                          <option key={vIdx} value={vIdx}>
                            Assign: {getVariantLabel(v, vIdx)} ({v.sku})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={() => navigate('/')}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : editingProductId
              ? <><Save size={16} /> Update Product</>
              : <><Save size={16} /> Save Product to Catalog</>}
          </button>
        </div>
      </form>

      {renderStickerModal()}

    </div>
  )
}
