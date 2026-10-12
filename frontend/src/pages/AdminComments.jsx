import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { MessageCircle, Package, RefreshCw, Send, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function toImageUrl(value) {
  if (!value) return ''
  return String(value).startsWith('http') ? value : `/api/products/images/${value}`
}

function getContext(comment) {
  if (comment.productContext) return comment.productContext
  const product = comment.productId || {}
  const variant = product.variants?.[0] || {}
  return {
    title: product.title || 'Product', image: variant.image || product.images?.[0] || '', sku: variant.sku || '',
    color: variant.color || variant.attributes?.Color || '', size: variant.size || variant.attributes?.Size || '',
    price: Number(variant.price || 0), stock: Number(variant.stock || 0), promotion: null
  }
}

function getProductId(comment) {
  const value = comment.productContext?.productId || comment.productId?._id || comment.productId
  return value && typeof value === 'object' ? String(value._id || '') : String(value || '')
}

function getProductUrl(comment, context) {
  const productId = getProductId(comment)
  const sku = String(context?.sku || comment.productContext?.sku || '')
  return productId ? `/product/${productId}${sku ? `?sku=${encodeURIComponent(sku)}` : ''}` : ''
}

export default function AdminComments() {
  const navigate = useNavigate()
  const [comments, setComments] = useState([])
  const [replies, setReplies] = useState({})
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [deletingThreadId, setDeletingThreadId] = useState('')
  const [actionError, setActionError] = useState('')

  const loadComments = async () => {
    setLoading(true)
    try {
      const response = await axios.get('/api/product-comments')
      setComments(Array.isArray(response.data) ? response.data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadComments()
    const timer = window.setInterval(loadComments, 15000)
    return () => window.clearInterval(timer)
  }, [])

  const submitReply = async (commentId) => {
    const text = String(replies[commentId] || '').trim()
    if (!text || sendingId) return
    setSendingId(commentId)
    try {
      const response = await axios.post(`/api/product-comments/${commentId}/replies`, { text })
      setComments(current => [...current, response.data])
      setReplies(current => ({ ...current, [commentId]: '' }))
    } catch (err) {
      alert(err.response?.data?.error || 'Could not post the reply.')
    } finally {
      setSendingId('')
    }
  }

  const removeComment = async (comment) => {
    const isThreadRoot = !comment.parentCommentId
    const prompt = isThreadRoot
      ? 'Delete this customer comment and all replies in its thread?'
      : 'Delete this comment?'
    if (!window.confirm(prompt)) return

    setDeletingId(String(comment._id))
    setActionError('')
    try {
      const response = await axios.delete(`/api/product-comments/${comment._id}`)
      const deletedIds = new Set((response.data.deletedIds || [comment._id]).map(String))
      setComments(current => current.filter(item => !deletedIds.has(String(item._id))))
    } catch (err) {
      setActionError(err.response?.data?.error || 'Could not delete this comment.')
    } finally {
      setDeletingId('')
    }
  }

  const removeThread = async (comment) => {
    if (!window.confirm('Delete this entire comment thread, including every reply?')) return
    setDeletingThreadId(String(comment._id))
    setActionError('')
    try {
      const response = await axios.delete(`/api/product-comments/thread/${comment._id}`)
      const deletedIds = new Set((response.data.deletedIds || [comment._id]).map(String))
      setComments(current => current.filter(item => !deletedIds.has(String(item._id))))
    } catch (err) {
      setActionError(err.response?.data?.error || 'Could not delete this comment thread.')
    } finally {
      setDeletingThreadId('')
    }
  }

  const threads = comments.filter(comment => !comment.parentCommentId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return <div className="page-wrapper comments-workspace">
    <div className="page-header comments-workspace-header">
      <div><h1 className="page-title"><MessageCircle size={22} /> Product Comments &amp; Questions</h1><p className="page-subtitle">Review customer inquiries and reply with the selected product details in view.</p></div>
      <button type="button" className="btn btn-secondary" onClick={loadComments} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh</button>
    </div>
    {actionError && <p role="alert" style={{ color: 'var(--color-danger)', marginBottom: 14 }}>{actionError}</p>}
    {loading && comments.length === 0 ? <p className="comments-workspace-empty">Loading customer conversations...</p> : threads.length === 0 ? <p className="comments-workspace-empty">No product comments yet.</p> : <div className="comments-workspace-list">
      {threads.map(comment => {
        const context = getContext(comment)
        const threadReplies = comments.filter(reply => String(reply.parentCommentId) === String(comment._id)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        return <article className="comment-workspace-thread" key={comment._id}>
          <div className="comment-workspace-conversation">
            <div className="comment-workspace-meta">
              <strong>{comment.authorName}</strong>
              <div className="comment-workspace-line-actions">
                <time>{new Date(comment.createdAt).toLocaleString()}</time>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeThread(comment)} disabled={Boolean(deletingId || deletingThreadId)} aria-label="Delete entire comment thread" title="Delete entire thread">
                  <Trash2 size={13} /> {deletingThreadId === String(comment._id) ? 'Deleting…' : 'Delete thread'}
                </button>
              </div>
            </div>
            <p className="comment-workspace-text">{comment.text}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeComment(comment)} disabled={Boolean(deletingId || deletingThreadId)} aria-label="Delete this customer comment" title="Delete this comment">
              <Trash2 size={13} /> Delete comment
            </button>
            {threadReplies.map(reply => (
              <div className={`comment-workspace-reply ${reply.isAdmin ? 'admin' : 'customer'}`} key={reply._id}>
                <div className="comment-workspace-line-actions">
                  <strong>{reply.isAdmin ? 'Win & Chit Support' : (reply.authorName || 'Customer')}</strong>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeComment(reply)} disabled={Boolean(deletingId || deletingThreadId)} aria-label="Delete this reply" title="Delete this reply">
                    <Trash2 size={13} /> {deletingId === String(reply._id) ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
                <p>{reply.text}</p>
                <time>{new Date(reply.createdAt).toLocaleString()}</time>
              </div>
            ))}
            <div className="comment-workspace-compose"><input className="form-input" value={replies[comment._id] || ''} onChange={event => setReplies(current => ({ ...current, [comment._id]: event.target.value }))} placeholder="Reply to this customer..." maxLength={1000} /><button type="button" className="btn btn-primary" aria-label="Send reply" disabled={!String(replies[comment._id] || '').trim() || sendingId === comment._id} onClick={() => submitReply(comment._id)}><Send size={16} /></button></div>
          </div>
          <button type="button" className="comment-product-context" onClick={() => { const productUrl = getProductUrl(comment, context); if (productUrl) navigate(productUrl) }} title="Open this product post">
            <div className="comment-product-context-title"><Package size={15} /> Product context</div>
            <div className="comment-product-context-main">{toImageUrl(context.image) ? <img src={toImageUrl(context.image)} alt="" /> : <div className="comment-product-context-placeholder"><Package size={20} /></div>}<div><strong>{context.title}</strong><span>{context.sku || 'No WC number'}</span></div></div>
            <dl><div><dt>Color / Size</dt><dd>{[context.color, context.size].filter(Boolean).join(' / ') || 'Default'}</dd></div><div><dt>Price</dt><dd>{Number(context.price || 0).toLocaleString()} Ks</dd></div><div><dt>Stock</dt><dd className={Number(context.stock || 0) > 0 ? 'in-stock' : 'out-stock'}>{Number(context.stock || 0) > 0 ? `${context.stock} pcs available` : 'Out of stock'}</dd></div>{context.promotion && <div><dt>Promotion</dt><dd>{context.promotion.title} · -{context.promotion.discountPercentage}%</dd></div>}</dl>
          </button>
        </article>
      })}
    </div>}
  </div>
}