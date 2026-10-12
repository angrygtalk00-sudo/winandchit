import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { MessageCircle, X, Send, User, Phone, Clock, RefreshCw, Trash2, CheckCircle2, Image as ImageIcon, Loader2, Reply, Radio } from 'lucide-react'
import { playWhooshSound, playNotificationSound, showDesktopNotification } from '../utils/chatAudio'
import { useChatHistory } from '../context/ChatHistoryContext'
import { mergeLatestChatMessages, mergeOlderChatMessages, parseChatMessagePage } from '../utils/chatMessages'

const CHAT_MESSAGE_PAGE_SIZE = 50

export default function AdminChatModal({ isOpen, onClose }) {
  const [conversations, setConversations] = useState([])
  const [selectedConvo, setSelectedConvo] = useState(null)
  const {
    messages,
    setMessages,
    hasMoreMessages,
    setHasMoreMessages,
    historyLoaded,
    setHistoryLoaded
  } = useChatHistory(selectedConvo?.conversationId || '')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [replyText, setReplyText] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [replyTarget, setReplyTarget] = useState(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState('')
  const [deletingMessageId, setDeletingMessageId] = useState('')
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const messagesContainerRef = useRef(null)
  const messageNodesRef = useRef({})
  const fileInputRef = useRef(null)
  const initialScrollPendingRef = useRef(false)
  const stickToBottomRef = useRef(true)
  const loadingOlderRef = useRef(false)
  const prependScrollRef = useRef(null)
  const wasOpenRef = useRef(false)
  const previousConversationIdRef = useRef(selectedConvo?.conversationId || '')
  const messageRequestIdRef = useRef(0)
  const conversationListRequestIdRef = useRef(0)
  const activeConversationDeleting = deletingConversationId === selectedConvo?.conversationId

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }

  const jumpToMessage = (messageId) => {
    const target = messageNodesRef.current[String(messageId)]
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add('chat-message-highlight')
    setHighlightedMessageId(String(messageId))
    window.setTimeout(() => {
      target.classList.remove('chat-message-highlight')
      setHighlightedMessageId(null)
    }, 1500)
  }

  const fetchConversations = async (keepSelection = true) => {
    const requestId = ++conversationListRequestIdRef.current
    try {
      setLoadingList(true)
      const res = await fetch('/api/chat/conversations')
      if (requestId !== conversationListRequestIdRef.current) return
      if (!res.ok) throw new Error(`Could not load conversations (${res.status})`)
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
        if (keepSelection && selectedConvoRef.current) {
          const updated = data.find(c => c.conversationId === selectedConvoRef.current.conversationId)
          if (updated) setSelectedConvo(updated)
        } else if (!keepSelection && data.length > 0 && !selectedConvoRef.current) {
          setSelectedConvo(data[0])
        }
      }
    } catch (err) {
      if (requestId === conversationListRequestIdRef.current) {
        console.error('Failed to load conversations:', err)
      }
    } finally {
      if (requestId === conversationListRequestIdRef.current) setLoadingList(false)
    }
  }

  const selectedConvoRef = useRef(selectedConvo)
  useLayoutEffect(() => {
    selectedConvoRef.current = selectedConvo
  }, [selectedConvo])

  const fetchMessages = async (conversationId) => {
    if (!conversationId) return
    const requestId = ++messageRequestIdRef.current
    loadingOlderRef.current = false
    prependScrollRef.current = null
    setLoadingOlder(false)
    try {
      setLoadingMessages(!historyLoaded)
      initialScrollPendingRef.current = true
      setHasMoreMessages(false)
      setHistoryError('')
      const params = new URLSearchParams({ viewer: 'admin', limit: String(CHAT_MESSAGE_PAGE_SIZE) })
      const res = await fetch(`/api/chat/messages/${encodeURIComponent(conversationId)}?${params}`)
      if (!res.ok) throw new Error(`Could not load messages (${res.status})`)
      const page = parseChatMessagePage(await res.json(), CHAT_MESSAGE_PAGE_SIZE)
      if (requestId !== messageRequestIdRef.current || selectedConvoRef.current?.conversationId !== conversationId) return
      if (page.messages.length === 0) {
        setMessages([])
        setHasMoreMessages(false)
      } else {
        setMessages(previous => mergeLatestChatMessages(previous, page.messages))
        setHasMoreMessages(previous => previous || page.hasMore)
      }
      setHistoryLoaded(true)
      stickToBottomRef.current = true
    } catch (err) {
      if (requestId === messageRequestIdRef.current) {
        console.error('Failed to load messages:', err)
        setHistoryError('Could not load this conversation.')
      }
    } finally {
      if (requestId === messageRequestIdRef.current) setLoadingMessages(false)
    }
  }

  async function loadOlderMessages() {
    if (loadingOlderRef.current || !hasMoreMessages || !messages.length || !selectedConvo?.conversationId) return
    const container = messagesContainerRef.current
    const oldestMessageId = messages[0]?._id
    if (!container || !oldestMessageId || String(oldestMessageId).startsWith('temp_')) return

    const requestId = messageRequestIdRef.current
    const conversationId = selectedConvo.conversationId
    loadingOlderRef.current = true
    prependScrollRef.current = { scrollTop: container.scrollTop, scrollHeight: container.scrollHeight }
    setLoadingOlder(true)
    setHistoryError('')

    try {
      const params = new URLSearchParams({
        viewer: 'admin',
        limit: String(CHAT_MESSAGE_PAGE_SIZE),
        before: String(oldestMessageId)
      })
      const response = await fetch(`/api/chat/messages/${encodeURIComponent(conversationId)}?${params}`)
      if (!response.ok) throw new Error(`Could not load older messages (${response.status})`)
      const page = parseChatMessagePage(await response.json(), CHAT_MESSAGE_PAGE_SIZE)
      if (requestId !== messageRequestIdRef.current || selectedConvoRef.current?.conversationId !== conversationId) return
      setMessages(previous => mergeOlderChatMessages(previous, page.messages))
      setHasMoreMessages(Boolean(page.hasMore))
      if (page.messages.length === 0) prependScrollRef.current = null
    } catch (err) {
      if (requestId === messageRequestIdRef.current) {
        prependScrollRef.current = null
        setHistoryError('Could not load older messages. Tap to retry.')
        console.error('Failed to load older admin messages:', err)
      }
    } finally {
      if (requestId === messageRequestIdRef.current) {
        loadingOlderRef.current = false
        setLoadingOlder(false)
      }
    }
  }

  function handleMessagesScroll(event) {
    if (event.currentTarget.scrollTop <= 40) loadOlderMessages()
  }

  useEffect(() => {
    if (isOpen) {
      fetchConversations(false)
    }
  }, [isOpen])

  // Poll for conversation list and active chat only while modal is open and page is visible (every 4s)
  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => {
      if (document.hidden) return
      fetchConversations(true)
      const conversationId = selectedConvoRef.current?.conversationId
      if (!loadingOlderRef.current && conversationId) {
        const requestId = messageRequestIdRef.current
        const params = new URLSearchParams({ viewer: 'admin', limit: String(CHAT_MESSAGE_PAGE_SIZE) })
        fetch(`/api/chat/messages/${encodeURIComponent(conversationId)}?${params}`)
          .then(res => {
            if (!res.ok) throw new Error(`Could not refresh messages (${res.status})`)
            return res.json()
          })
          .then(page => {
            const latestPage = parseChatMessagePage(page, CHAT_MESSAGE_PAGE_SIZE)
            if (
              requestId === messageRequestIdRef.current &&
              selectedConvoRef.current?.conversationId === conversationId
            ) {
              if (latestPage.messages.length === 0) {
                setMessages([])
                setHasMoreMessages(false)
                setHistoryLoaded(true)
                return
              }
              setMessages(prev => {
                const latestMessage = latestPage.messages[latestPage.messages.length - 1]
                const isNewMessage = latestMessage && !prev.some(message => String(message._id) === String(latestMessage._id))
                const container = messagesContainerRef.current
                const nearBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight <= 120
                const merged = mergeLatestChatMessages(prev, latestPage.messages)
                if (merged !== prev) stickToBottomRef.current = nearBottom
                if (isNewMessage && latestMessage.sender === 'customer' && prev.length > 0) {
                  playNotificationSound()
                  showDesktopNotification(`New message from ${selectedConvoRef.current?.customerName || 'Customer'}`, {
                    body: latestMessage.text || (latestMessage.imageUrl ? 'Sent an image attachment' : 'New inquiry')
                  })
                }
                return merged
              })
            }
          })
          .catch(err => console.error('Failed to refresh admin chat messages:', err))
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [isOpen, selectedConvo?.conversationId])

  useEffect(() => {
    if (selectedConvo?.conversationId) {
      fetchMessages(selectedConvo.conversationId)
    } else {
      messageRequestIdRef.current += 1
      setMessages([])
      setHasMoreMessages(false)
      setLoadingMessages(false)
    }
  }, [selectedConvo?.conversationId])

  useLayoutEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current
    wasOpenRef.current = isOpen
    if (justOpened) initialScrollPendingRef.current = true
    const conversationId = selectedConvo?.conversationId || ''
    if (previousConversationIdRef.current !== conversationId) {
      previousConversationIdRef.current = conversationId
      initialScrollPendingRef.current = Boolean(conversationId)
    }

    const container = messagesContainerRef.current
    if (!isOpen || !conversationId || loadingMessages || !container) return

    if (prependScrollRef.current) {
      const { scrollTop, scrollHeight } = prependScrollRef.current
      container.scrollTop = scrollTop + container.scrollHeight - scrollHeight
      prependScrollRef.current = null
      return
    }

    if (initialScrollPendingRef.current || stickToBottomRef.current) {
      scrollToBottom()
      initialScrollPendingRef.current = false
      stickToBottomRef.current = false
    }
  }, [isOpen, loadingMessages, messages, selectedConvo?.conversationId])

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return

    if (file.type && file.type.startsWith('video/')) {
      alert('Only photo files are allowed (JPEG, PNG, WEBP). Video files are strictly rejected.')
      return
    }

    if (!file.type || !file.type.startsWith('image/')) {
      alert('Invalid file format. Please select an image (JPEG, PNG, or WEBP).')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image size exceeds 10MB limit.')
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setSelectedPhoto({ file, previewUrl })
  }

  const handleClearPhoto = () => {
    if (selectedPhoto?.previewUrl) {
      URL.revokeObjectURL(selectedPhoto.previewUrl)
    }
    setSelectedPhoto(null)
  }

  const handleSendReply = async (e) => {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault()
      if (typeof e.stopPropagation === 'function') e.stopPropagation()
    }
    const textToSend = replyText.trim()
    if ((!textToSend && !selectedPhoto) || !selectedConvo?.conversationId || sending || uploadingPhoto || activeConversationDeleting) return

    const pendingPhoto = selectedPhoto
    const pendingReply = replyTarget
    setReplyText('')
    setSelectedPhoto(null)
    setReplyTarget(null)
    setSending(true)

    // Optimistically add message
    const tempId = `temp_admin_${Date.now()}`
    const optimisticMsg = {
      _id: tempId,
      conversationId: selectedConvo.conversationId,
      sender: 'admin',
      text: textToSend,
      imageUrl: pendingPhoto?.previewUrl || null,
      replyTo: pendingReply ? { messageId: pendingReply._id, sender: pendingReply.sender, text: pendingReply.text || '' } : null,
      createdAt: new Date().toISOString()
    }
    stickToBottomRef.current = true
    setMessages(prev => [...prev, optimisticMsg])

    try {
      let uploadedImageUrl = null

      if (pendingPhoto?.file) {
        setUploadingPhoto(true)
        setUploadProgress(10)

        uploadedImageUrl = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', '/api/chat/upload-photo')

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const pct = Math.min(95, Math.round((evt.loaded / evt.total) * 100))
              setUploadProgress(pct)
            }
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const resJson = JSON.parse(xhr.responseText)
                setUploadProgress(100)
                resolve(resJson.url)
              } catch (parseErr) {
                reject(new Error('Invalid response from server'))
              }
            } else {
              reject(new Error('Upload failed'))
            }
          }

          xhr.onerror = () => reject(new Error('Network error during upload'))

          const formData = new FormData()
          formData.append('photo', pendingPhoto.file)
          xhr.send(formData)
        }).catch(err => {
          console.error('Photo upload failed:', err)
          alert('Failed to upload photo. Sending text only.')
          return null
        })
      }

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConvo.conversationId,
          sender: 'admin',
          text: textToSend,
          imageUrl: uploadedImageUrl
          ,replyTo: pendingReply ? { messageId: pendingReply._id, sender: pendingReply.sender, text: pendingReply.text || '' } : null
        })
      })
      if (res.ok) {
        const newMsg = await res.json()
        setMessages(prev => prev.map(m => (m._id === tempId ? newMsg : m)))
        fetchConversations(true)
        playWhooshSound()
      } else {
        console.error('Failed to post admin reply:', await res.text())
      }
    } catch (err) {
      console.error('Failed to send reply:', err)
    } finally {
      setSending(false)
      setUploadingPhoto(false)
      setUploadProgress(0)
      if (pendingPhoto?.previewUrl) {
        URL.revokeObjectURL(pendingPhoto.previewUrl)
      }
    }
  }

  const handleDeleteSingleMessage = async (messageId) => {
    if (!messageId || deletingMessageId || activeConversationDeleting) return
    if (!window.confirm('Are you sure you want to delete this message/image? This cannot be undone.')) return
    const conversationId = selectedConvo?.conversationId
    setDeletingMessageId(String(messageId))
    try {
      const res = await fetch(`/api/chat/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' })
      if (res.ok) {
        const result = await res.json().catch(() => ({}))
        if (result.imageCleanupFailures) {
          alert(`${result.imageCleanupFailures} hosted image(s) could not be deleted.`)
        }
        if (selectedConvoRef.current?.conversationId === conversationId) {
          messageRequestIdRef.current += 1
          loadingOlderRef.current = false
          prependScrollRef.current = null
          setLoadingOlder(false)
        }
        setMessages(prev => prev.filter(m => String(m._id) !== String(messageId)))
        fetchConversations(true)
      } else {
        const body = await res.json().catch(() => null)
        alert(body?.error || 'Failed to delete message.')
      }
    } catch (err) {
      console.error('Failed to delete single message:', err)
      alert('Could not delete this message. Please try again.')
    } finally {
      setDeletingMessageId('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendReply(e)
    }
  }

  const handleDeleteConversation = async (conversationId) => {
    if (!conversationId || deletingConversationId || deletingMessageId || sending || uploadingPhoto) return
    if (!window.confirm('Clear all messages from this chat? This cannot be undone.')) return
    setDeletingConversationId(conversationId)
    try {
      const res = await fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Failed to clear chat history.')
      }
      const result = await res.json()
      if (!result.success) throw new Error('The server did not confirm the chat history was cleared.')
      if (result.imageCleanupFailures) {
        alert(`${result.imageCleanupFailures} hosted image(s) could not be deleted.`)
      }

      conversationListRequestIdRef.current += 1
      const clearedAt = new Date().toISOString()
      const clearedConversation = {
        ...(selectedConvoRef.current?.conversationId === conversationId ? selectedConvoRef.current : {}),
        conversationId,
        lastMessage: '',
        lastMessageAt: clearedAt,
        unreadByAdmin: 0,
        unreadByCustomer: 0
      }
      setConversations(previous => previous.map(conversation => (
        conversation.conversationId === conversationId
          ? { ...conversation, ...clearedConversation }
          : conversation
      )))
      setHasMoreMessages(false)
      setHistoryLoaded(true)
      setMessages([])

      if (selectedConvoRef.current?.conversationId === conversationId) {
        messageRequestIdRef.current += 1
        selectedConvoRef.current = clearedConversation
        loadingOlderRef.current = false
        prependScrollRef.current = null
        setLoadingOlder(false)
        setLoadingMessages(false)
        setHistoryError('')
        setReplyTarget(null)
        stickToBottomRef.current = true
        setSelectedConvo(clearedConversation)
      }
      fetchConversations(true)
    } catch (err) {
      console.error('Failed to clear conversation history:', err)
      alert(err.message || 'Could not clear this chat. Please try again.')
    } finally {
      setDeletingConversationId('')
    }
  }

  const handleBroadcast = async () => {
    const text = broadcastText.trim()
    if (!text || broadcasting) return
    setBroadcasting(true)
    try {
      const response = await fetch('/api/chat/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not send broadcast')
      setBroadcastText('')
      setBroadcastOpen(false)
      fetchConversations(true)
      playWhooshSound()
      alert(`Broadcast delivered to ${data.delivered || 0} visitor conversation${data.delivered === 1 ? '' : 's'}.`)
    } catch (err) {
      alert(err.message || 'Could not send broadcast.')
    } finally {
      setBroadcasting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="admin-chat-modal-backdrop" onClick={onClose}>
      <div className="admin-chat-modal-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="admin-chat-header">
          <div className="admin-chat-title-group">
            <span className="admin-chat-icon-badge">
              <MessageCircle size={18} />
            </span>
            <div>
              <h3>Customer Support &amp; Inquiries</h3>
              <span className="admin-chat-subtitle">Real-time chat • 60-day rolling history</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="admin-chat-broadcast-btn" onClick={() => setBroadcastOpen(true)} title="Send a message to all visitors">
              <Radio size={15} /> Broadcast
            </button>
            <button
              type="button"
              className="admin-chat-header-btn"
              onClick={() => {
                fetchConversations(true)
                if (selectedConvo?.conversationId) fetchMessages(selectedConvo.conversationId)
              }}
              title="Refresh messages"
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button"
              className="admin-chat-header-btn"
              onClick={onClose}
              title="Close chat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {broadcastOpen && <div className="admin-broadcast-backdrop" onClick={() => setBroadcastOpen(false)}><section className="admin-broadcast-dialog" role="dialog" aria-modal="true" aria-label="Broadcast message" onClick={event => event.stopPropagation()}><div><strong>Broadcast message</strong><button type="button" onClick={() => setBroadcastOpen(false)} aria-label="Close broadcast"><X size={17} /></button></div><p>This sends a support notification to every registered account and remembered guest visitor.</p><textarea className="form-textarea" value={broadcastText} onChange={event => setBroadcastText(event.target.value)} maxLength={1000} placeholder="Write a message for all visitors..." autoFocus /><button type="button" className="btn btn-primary" onClick={handleBroadcast} disabled={!broadcastText.trim() || broadcasting}>{broadcasting ? 'Sending...' : <><Send size={15} /> Send broadcast</>}</button></section></div>}

        {/* Content Split: Convo List + Message Window */}
        <div className="admin-chat-body">
          {/* Sidebar / Conversation List */}
          <div className="admin-chat-sidebar">
            <div className="admin-chat-sidebar-header">
              <span>All Inquiries ({conversations.length})</span>
            </div>
            <div className="admin-chat-convos-list">
              {loadingList && conversations.length === 0 ? (
                <div className="admin-chat-empty-msg">Loading inquiries...</div>
              ) : conversations.length === 0 ? (
                <div className="admin-chat-empty-msg">No customer inquiries yet.</div>
              ) : (
                conversations.map(convo => {
                  const isSelected = selectedConvo?.conversationId === convo.conversationId
                  const timeFormatted = convo.lastMessageAt ? new Date(convo.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                  return (
                    <div
                      key={convo.conversationId}
                      className={`admin-chat-convo-item ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedConvo(convo)}
                    >
                      <div className="admin-chat-convo-avatar">
                        <User size={16} />
                      </div>
                      <div className="admin-chat-convo-info">
                        <div className="admin-chat-convo-top">
                          <strong className="admin-chat-convo-name">
                            {convo.customerName || 'Guest User'}
                          </strong>
                          <span className="admin-chat-convo-time">{timeFormatted}</span>
                        </div>
                        <div className="admin-chat-convo-details">
                          {convo.isGuest ? (
                            <span className="guest-badge">Guest</span>
                          ) : (
                            <span className="member-badge">VIP Member</span>
                          )}
                          {convo.customerPhone && (
                            <span className="admin-chat-convo-phone">
                              <Phone size={10} /> {convo.customerPhone}
                            </span>
                          )}
                        </div>
                        <div className="admin-chat-convo-preview">
                          {convo.lastMessage || 'No messages yet'}
                        </div>
                      </div>
                      {convo.unreadByAdmin > 0 && (
                        <span className="admin-chat-unread-pill">
                          {convo.unreadByAdmin}
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Chat Message Window */}
          <div className="admin-chat-main">
            {selectedConvo ? (
              <>
                {/* Active Chat Topbar */}
                <div className="admin-chat-active-topbar">
                  <div className="admin-chat-active-user">
                    <h4>{selectedConvo.customerName || 'Guest Visitor'}</h4>
                    <div className="admin-chat-active-meta">
                      {selectedConvo.isGuest ? (
                        <span className="guest-badge">Guest Session</span>
                      ) : (
                        <span className="member-badge">Registered User</span>
                      )}
                      {selectedConvo.customerPhone && (
                        <span className="admin-chat-active-phone">
                          <Phone size={12} /> {selectedConvo.customerPhone}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="admin-chat-del-btn"
                    onClick={() => handleDeleteConversation(selectedConvo.conversationId)}
                    title={activeConversationDeleting ? 'Clearing chat history…' : 'Clear chat history'}
                    disabled={Boolean(deletingConversationId) || sending || uploadingPhoto || Boolean(deletingMessageId)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Messages feed */}
                <div className="admin-chat-messages-scroll" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
                  {loadingOlder && <div className="chat-history-loading" role="status">Loading older messages…</div>}
                  {historyError && (
                    <button
                      type="button"
                      className="chat-history-error"
                      onClick={() => hasMoreMessages ? loadOlderMessages() : fetchMessages(selectedConvo.conversationId)}
                    >
                      {historyError}
                    </button>
                  )}
                  {loadingMessages ? (
                    <div className="admin-chat-loading-chat">Loading conversation...</div>
                  ) : messages.length === 0 ? (
                    <div className="admin-chat-loading-chat">No messages yet. Send a greeting to start chatting.</div>
                  ) : (
                    messages.map((m, idx) => {
                      const isAdmin = m.sender === 'admin'
                      const timeStr = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                      return (
                        <div
                          key={m._id || idx}
                          ref={node => { if (node && m._id) messageNodesRef.current[String(m._id)] = node }}
                          className={`admin-chat-bubble-wrap ${isAdmin ? 'admin' : 'customer'}`}
                        >
                          <div className={`admin-chat-bubble ${isAdmin ? 'admin-bubble' : 'customer-bubble'}`} title={m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}>
                            <div className="admin-chat-bubble-header-row">
                              <span className="admin-chat-bubble-sender">
                                {isAdmin ? 'Win & Chit Support' : (selectedConvo.customerName || 'Customer')}
                              </span>
                              {/* Admin Single Message Deletion Control */}
                              {m._id && !m._id.startsWith('temp_') && (
                                <button
                                  type="button"
                                  className="admin-msg-delete-btn"
                                  onClick={() => handleDeleteSingleMessage(m._id)}
                                  title={deletingMessageId === String(m._id) ? 'Deleting message…' : 'Delete this message/photo'}
                                  disabled={Boolean(deletingMessageId) || activeConversationDeleting}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                            {m.imageUrl && (
                              <div className="admin-chat-bubble-image-wrap">
                                <a href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={m.imageUrl} alt="Attachment" className="admin-chat-bubble-image" />
                                </a>
                              </div>
                            )}
                            {m.replyTo?.messageId && <button type="button" className="chat-quote" onClick={() => jumpToMessage(m.replyTo.messageId)}><strong>{m.replyTo.sender === 'admin' ? 'Win & Chit Support' : (selectedConvo.customerName || 'Customer')}</strong><span>{m.replyTo.text || 'Photo attachment'}</span></button>}
                            {m.text && <div className="admin-chat-bubble-text">{m.text}</div>}
                            {highlightedMessageId === String(m._id) && <div className="chat-source-context">Original message · {new Date(m.createdAt).toLocaleString()}</div>}
                            <div className="admin-chat-bubble-time">{timeStr}</div>
                            <button type="button" className="chat-reply-btn" onClick={() => setReplyTarget(m)} title="Reply to this message"><Reply size={13} /></button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Selected Photo Attachment Preview Bar in Admin Modal with % counter */}
                {selectedPhoto && (
                  <div className="admin-chat-photo-preview-bar">
                    <div className="admin-chat-photo-preview-card">
                      <img src={selectedPhoto.previewUrl} alt="Preview" />
                      {uploadingPhoto ? (
                        <div className="photo-upload-progress-overlay">
                          <span className="photo-progress-pct">{uploadProgress}%</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="customer-chat-photo-preview-remove"
                          onClick={handleClearPhoto}
                          title="Remove photo"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div className="admin-chat-photo-preview-info">
                      <span className="photo-preview-name">{selectedPhoto.file.name}</span>
                      <span className="photo-preview-size">
                        {uploadingPhoto
                          ? `Uploading image (${uploadProgress}%)...`
                          : `${(selectedPhoto.file.size / 1024).toFixed(1)} KB • Ready to send`}
                      </span>
                      {uploadingPhoto && (
                        <div className="photo-progress-track">
                          <div className="photo-progress-fill" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reply Input Bar with Photo Button OUTSIDE to the left */}
                {replyTarget && <div className="chat-reply-preview"><Reply size={14} /><span>Replying to {replyTarget.sender === 'admin' ? 'support' : (selectedConvo.customerName || 'customer')}: {replyTarget.text || 'Photo attachment'}</span><button type="button" onClick={() => setReplyTarget(null)}><X size={14} /></button></div>}
                <form className="admin-chat-input-bar" onSubmit={handleSendReply}>
                  {/* Hidden file input restricted strictly to images */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/jpg"
                    style={{ display: 'none' }}
                    onChange={handlePhotoSelect}
                  />

                  {/* Photo action button OUTSIDE input box on the left */}
                  <button
                    type="button"
                    className="admin-chat-attach-outer-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach photo (Images only)"
                    aria-label="Attach photo"
                    disabled={sending || uploadingPhoto || activeConversationDeleting}
                  >
                    <ImageIcon size={19} />
                  </button>

                  <input
                    type="text"
                    className="admin-chat-input"
                    placeholder={selectedPhoto ? 'Add a caption...' : `Reply to ${selectedConvo.customerName || 'Customer'}...`}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending || uploadingPhoto || activeConversationDeleting}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary admin-chat-send-btn"
                    onClick={handleSendReply}
                    disabled={(!replyText.trim() && !selectedPhoto) || sending || uploadingPhoto || activeConversationDeleting}
                  >
                    {uploadingPhoto ? (
                      <span className="btn-upload-pct">{uploadProgress}%</span>
                    ) : (
                      <>
                        <Send size={15} /> Send
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="admin-chat-no-selection">
                <MessageCircle size={48} strokeWidth={1.5} color="#5ea882" />
                <h3>Customer Chat Hub</h3>
                <p>Select a customer conversation from the left to view messages and respond in real-time.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
