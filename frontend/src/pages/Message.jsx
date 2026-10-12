import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Send, Sparkles, User, Phone, ShieldCheck, ShoppingBag, HelpCircle, ArrowLeft, Image as ImageIcon, X, Loader2, Reply } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useChatHistory } from '../context/ChatHistoryContext'
import { playWhooshSound, playNotificationSound } from '../utils/chatAudio'
import { mergeLatestChatMessages, mergeOlderChatMessages, parseChatMessagePage } from '../utils/chatMessages'

const CHAT_MESSAGE_PAGE_SIZE = 50

function resolveImage(image) {
  if (!image) return null
  return String(image).startsWith('http') ? image : `/api/products/images/${image}`
}

function getOrCreateGuestSession() {
  try {
    let guestId = localStorage.getItem('winandchit_guest_chat_id')
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36)
      localStorage.setItem('winandchit_guest_chat_id', guestId)
    }
    return guestId
  } catch (e) {
    return 'guest_' + Date.now()
  }
}

export default function Message() {
  const { chatOrderItem, clearChatOrder } = useCart()
  const [currentUser] = useState(() => {
    try {
      const stored = localStorage.getItem('winandchit_auth_user')
      return stored ? JSON.parse(stored) : null
    } catch (e) {
      return null
    }
  })
  const [guestSessionId] = useState(() => getOrCreateGuestSession())
  const conversationId = currentUser?.id || currentUser?._id
    ? `user_${currentUser.id || currentUser._id}`
    : guestSessionId
  const isGuest = !currentUser
  const {
    messages,
    setMessages,
    hasMoreMessages,
    setHasMoreMessages,
    historyLoaded,
    setHistoryLoaded
  } = useChatHistory(conversationId)
  const [inputVal, setInputVal] = useState('')
  const [loading, setLoading] = useState(() => !historyLoaded)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(null) // { file, previewUrl }
  const [uploadProgress, setUploadProgress] = useState(0) // 0-100%
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [replyTarget, setReplyTarget] = useState(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const fileInputRef = useRef(null)
  const [guestName, setGuestName] = useState(() => {
    try {
      return localStorage.getItem('winandchit_guest_name') || ''
    } catch (e) {
      return ''
    }
  })
  const [guestPhone, setGuestPhone] = useState(() => {
    try {
      return localStorage.getItem('winandchit_guest_phone') || ''
    } catch (e) {
      return ''
    }
  })
  const messagesFeedRef = useRef(null)
  const messageNodesRef = useRef({})
  const guestNameRef = useRef(guestName)
  const guestPhoneRef = useRef(guestPhone)
  const initialScrollDoneRef = useRef(false)
  const stickToBottomRef = useRef(true)
  const loadingOlderRef = useRef(false)
  const prependScrollRef = useRef(null)
  const deletedMessageIdsRef = useRef(new Set())
  const historyGenerationRef = useRef(0)

  const withoutDeletedMessages = (items) => {
    if (deletedMessageIdsRef.current.size === 0) return items
    const visible = items.filter(message => !deletedMessageIdsRef.current.has(String(message._id)))
    return visible.length === items.length ? items : visible
  }

  const scrollToBottom = () => {
    if (messagesFeedRef.current) {
      messagesFeedRef.current.scrollTop = messagesFeedRef.current.scrollHeight
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

  useEffect(() => {
    guestNameRef.current = guestName
  }, [guestName])

  useEffect(() => {
    guestPhoneRef.current = guestPhone
  }, [guestPhone])

  async function loadOlderMessages() {
    if (loadingOlderRef.current || !hasMoreMessages || !messages.length) return
    const requestGeneration = historyGenerationRef.current
    const feed = messagesFeedRef.current
    const oldestMessageId = messages[0]?._id
    if (!feed || !oldestMessageId || String(oldestMessageId).startsWith('temp_')) return

    loadingOlderRef.current = true
    prependScrollRef.current = { scrollTop: feed.scrollTop, scrollHeight: feed.scrollHeight }
    setLoadingOlder(true)
    setHistoryError('')

    try {
      const params = new URLSearchParams({
        viewer: 'customer',
        limit: String(CHAT_MESSAGE_PAGE_SIZE),
        before: String(oldestMessageId)
      })
      const response = await fetch(`/api/chat/messages/${encodeURIComponent(conversationId)}?${params}`)
      if (!response.ok) throw new Error(`Could not load older messages (${response.status})`)
      const page = parseChatMessagePage(await response.json(), CHAT_MESSAGE_PAGE_SIZE)
      if (requestGeneration !== historyGenerationRef.current) return
      const visibleMessages = withoutDeletedMessages(page.messages)
      setMessages(previous => requestGeneration === historyGenerationRef.current
        ? mergeOlderChatMessages(withoutDeletedMessages(previous), visibleMessages)
        : previous)
      setHasMoreMessages(Boolean(page.hasMore))
      if (page.messages.length === 0) prependScrollRef.current = null
    } catch (err) {
      prependScrollRef.current = null
      setHistoryError('Could not load older messages. Tap to retry.')
      console.error('Failed to load older customer messages:', err)
    } finally {
      if (requestGeneration === historyGenerationRef.current) {
        loadingOlderRef.current = false
        setLoadingOlder(false)
      }
    }
  }

  function handleMessagesScroll(event) {
    if (event.currentTarget.scrollTop <= 40) loadOlderMessages()
  }

  // 1. Initial conversation registration & fetch messages once on mount
  useEffect(() => {
    let isMounted = true
    deletedMessageIdsRef.current.clear()
    const eventSource = new EventSource(`/api/chat/events/${encodeURIComponent(conversationId)}`)
    const handleMessageDeleted = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (
          payload?.conversationId !== conversationId ||
          (typeof payload.messageId !== 'string' && typeof payload.messageId !== 'number')
        ) {
          throw new Error('Invalid message-deleted event payload')
        }
        const messageId = String(payload.messageId)
        deletedMessageIdsRef.current.add(messageId)
        if (isMounted) {
          setMessages(previous => previous.filter(message => String(message._id) !== messageId))
        }
      } catch (err) {
        console.error('Could not process chat message deletion event:', err)
      }
    }
    const handleConversationCleared = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.conversationId !== conversationId) {
          throw new Error('Invalid conversation-cleared event payload')
        }
        historyGenerationRef.current += 1
        deletedMessageIdsRef.current.clear()
        loadingOlderRef.current = false
        prependScrollRef.current = null
        setMessages([])
        setHasMoreMessages(false)
        setHistoryLoaded(true)
        setHistoryError('')
        setLoadingOlder(false)
        setLoading(false)
        stickToBottomRef.current = true
      } catch (err) {
        console.error('Could not process conversation-cleared event:', err)
      }
    }
    eventSource.addEventListener('message-deleted', handleMessageDeleted)
    eventSource.addEventListener('conversation-cleared', handleConversationCleared)
    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        console.error('Chat real-time event stream closed; periodic refresh remains active.')
      }
    }

    const waitForEventStream = () => new Promise(resolve => {
      if (eventSource.readyState === EventSource.OPEN) {
        resolve()
        return
      }
      const handleOpen = () => {
        window.clearTimeout(timeoutId)
        resolve()
      }
      const timeoutId = window.setTimeout(() => {
        eventSource.removeEventListener('open', handleOpen)
        resolve()
      }, 1500)
      eventSource.addEventListener('open', handleOpen, { once: true })
    })

    const initChat = async () => {
      try {
        setLoading(!historyLoaded)
        // Register/sync conversation on backend
        await fetch('/api/chat/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            isGuest,
            userId: currentUser?.id || currentUser?._id || null,
            customerName: currentUser?.name || guestNameRef.current || 'Guest Visitor',
            customerPhone: currentUser?.phone || guestPhoneRef.current || ''
          })
        })

        await waitForEventStream()
        if (!isMounted) return

        // Fetch history
        const params = new URLSearchParams({ viewer: 'customer', limit: String(CHAT_MESSAGE_PAGE_SIZE) })
        const requestGeneration = historyGenerationRef.current
        const res = await fetch(`/api/chat/messages/${encodeURIComponent(conversationId)}?${params}`)
        if (!res.ok) throw new Error(`Could not load chat history (${res.status})`)
          const page = parseChatMessagePage(await res.json(), CHAT_MESSAGE_PAGE_SIZE)
          if (isMounted && requestGeneration === historyGenerationRef.current) {
            setMessages(previous => {
              if (requestGeneration !== historyGenerationRef.current) return previous
              if (page.messages.length === 0) return []
              return mergeLatestChatMessages(
                withoutDeletedMessages(previous),
                withoutDeletedMessages(page.messages)
              )
            })
            setHasMoreMessages(previous => (
              requestGeneration !== historyGenerationRef.current
                ? previous
                : page.messages.length === 0 ? false : previous || page.hasMore
            ))
            setHistoryLoaded(true)
            stickToBottomRef.current = true
        }
      } catch (err) {
        console.error('Failed to init customer chat:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initChat()

    // 2. Poll only for new messages while user is on this page (every 4 seconds, only if tab is visible)
    const interval = setInterval(async () => {
      if (document.hidden || loadingOlderRef.current) return
      const requestGeneration = historyGenerationRef.current
      try {
        const params = new URLSearchParams({ viewer: 'customer', limit: String(CHAT_MESSAGE_PAGE_SIZE) })
        const res = await fetch(`/api/chat/messages/${encodeURIComponent(conversationId)}?${params}`)
        if (!res.ok) throw new Error(`Could not refresh chat (${res.status})`)
        const page = parseChatMessagePage(await res.json(), CHAT_MESSAGE_PAGE_SIZE)
        if (isMounted && requestGeneration === historyGenerationRef.current) {
          if (page.messages.length === 0) {
            setMessages(previous => {
              if (requestGeneration !== historyGenerationRef.current) return previous
              const pending = previous.filter(message => String(message._id || '').startsWith('temp_'))
              return pending.length ? pending : []
            })
            setHasMoreMessages(false)
            setHistoryLoaded(true)
            stickToBottomRef.current = true
            return
          }
          setMessages(prev => {
            if (requestGeneration !== historyGenerationRef.current) return prev
            const visibleMessages = withoutDeletedMessages(page.messages)
            const latestMessage = visibleMessages[visibleMessages.length - 1]
            const isNewMessage = latestMessage && !prev.some(message => String(message._id) === String(latestMessage._id))
            const feed = messagesFeedRef.current
            const nearBottom = !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 120
            const merged = mergeLatestChatMessages(
              withoutDeletedMessages(prev),
              visibleMessages
            )
            if (merged !== prev) stickToBottomRef.current = nearBottom
            if (isNewMessage && latestMessage.sender === 'admin' && prev.length > 0) {
              playNotificationSound()
            }
            return merged
          })
        }
      } catch (err) {
        console.error('Failed to refresh customer chat messages:', err)
      }
    }, 4000)

    return () => {
      isMounted = false
      clearInterval(interval)
      eventSource.removeEventListener('message-deleted', handleMessageDeleted)
      eventSource.removeEventListener('conversation-cleared', handleConversationCleared)
      eventSource.close()
    }
  }, [conversationId, isGuest])

  useLayoutEffect(() => {
    const feed = messagesFeedRef.current
    if (loading || !feed) return

    if (prependScrollRef.current) {
      const { scrollTop, scrollHeight } = prependScrollRef.current
      feed.scrollTop = scrollTop + feed.scrollHeight - scrollHeight
      prependScrollRef.current = null
      return
    }

    if (!initialScrollDoneRef.current || stickToBottomRef.current) {
      scrollToBottom()
      initialScrollDoneRef.current = true
      stickToBottomRef.current = false
    }
  }, [messages, loading])

  // Handle file select restricted to photo formats only
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0]
    // Reset file input value so selecting the same file again still fires change
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return

    // Strict validation: Only photos (JPEG, PNG, WEBP, GIF, etc.) and explicitly reject videos
    if (file.type && file.type.startsWith('video/')) {
      alert('Only photos (JPEG, PNG, WEBP) can be attached. Video files are not supported.')
      return
    }

    if (!file.type || !file.type.startsWith('image/')) {
      alert('Invalid file format. Please select a photo (JPEG, PNG, or WEBP).')
      return
    }

    // Limit photo size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert('Photo size exceeds 10MB limit. Please choose a smaller image.')
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

  const handleSendMessage = async (e) => {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault()
      if (typeof e.stopPropagation === 'function') e.stopPropagation()
    }
    const textToSend = inputVal.trim()
    if ((!textToSend && !selectedPhoto) || sending || uploadingPhoto) return

    const pendingPhoto = selectedPhoto
    const pendingReply = replyTarget

    // Immediately clear input and preview state
    setInputVal('')
    setSelectedPhoto(null)
    setReplyTarget(null)
    setSending(true)

    // Construct final payload text (including inquiry item if present)
    let finalMsg = textToSend
    if (chatOrderItem) {
      finalMsg = `[Interested in: ${chatOrderItem.title} (${chatOrderItem.variantLabel || 'Standard'}) - ${Number(chatOrderItem.price || 0).toLocaleString()} Ks]${textToSend ? `\n${textToSend}` : ''}`
      clearChatOrder()
    }

    // Prepare active conversation ID (fallback to persistent guest ID if state is empty)
    const activeConvoId = conversationId || (isGuest ? (localStorage.getItem('winandchit_guest_chat_id') || `guest_${Date.now()}`) : (currentUser?.id || currentUser?._id ? `user_${currentUser.id || currentUser._id}` : 'guest_visitor'))

    // Optimistically render in message list for zero-delay UX
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const optimisticMsg = {
      _id: tempId,
      conversationId: activeConvoId,
      sender: 'customer',
      text: finalMsg,
      imageUrl: pendingPhoto?.previewUrl || null,
      replyTo: pendingReply ? { messageId: pendingReply._id, sender: pendingReply.sender, text: pendingReply.text || '' } : null,
      createdAt: new Date().toISOString()
    }
    stickToBottomRef.current = true
    setMessages(prev => [...prev, optimisticMsg])

    try {
      let uploadedImageUrl = null

      // If a photo was attached, upload it with real progress tracking (%).
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

      // Save guest info locally for convenience
      if (isGuest) {
        if (guestName) localStorage.setItem('winandchit_guest_name', guestName)
        if (guestPhone) localStorage.setItem('winandchit_guest_phone', guestPhone)
      }

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConvoId,
          sender: 'customer',
          text: finalMsg,
          imageUrl: uploadedImageUrl,
          customerName: currentUser?.name || guestName || 'Guest Visitor',
          customerPhone: currentUser?.phone || guestPhone || '',
          isGuest,
          userId: currentUser?.id || currentUser?._id || null
          ,replyTo: pendingReply ? { messageId: pendingReply._id, sender: pendingReply.sender, text: pendingReply.text || '' } : null
        })
      })

      if (res.ok) {
        const savedMsg = await res.json()
        setMessages(prev => prev.map(m => (m._id === tempId ? savedMsg : m)))
        // Play satisfying sent whoosh sound
        playWhooshSound()
      } else {
        console.error('Failed to save message to server:', await res.text())
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
      setUploadingPhoto(false)
      setUploadProgress(0)
      if (pendingPhoto?.previewUrl) {
        URL.revokeObjectURL(pendingPhoto.previewUrl)
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  const previewImage = resolveImage(chatOrderItem?.image)

  return (
    <div className="customer-chat-screen">
      {/* Top Header */}
      <div className="customer-chat-header">
        <div className="customer-chat-header-main">
          <div className="customer-chat-avatar">
            <img src="/assets/winandchit-logo.png" alt="Win & Chit" />
            <span className="customer-chat-online-dot" />
          </div>
          <div>
            <h3>Win &amp; Chit Customer Care</h3>
            <span className="customer-chat-status">
              Support Staff Online • Instant Replies
            </span>
          </div>
        </div>

        {/* User Identity Chip */}
        <div className="customer-chat-identity-tag">
          {currentUser ? (
            <span className="vip-user-chip" title="Logged in VIP account">
              <ShieldCheck size={13} /> {currentUser.name} ({currentUser.phone})
            </span>
          ) : (
            <span className="guest-user-chip" title="Guest Session">
              <User size={13} /> Guest Visitor
            </span>
          )}
        </div>
      </div>

      {/* Optional Chat Order Item Floating Attachment */}
      {chatOrderItem && (
        <div className="customer-chat-order-pill">
          {previewImage ? (
            <img src={previewImage} alt={chatOrderItem.title} />
          ) : (
            <ShoppingBag size={20} />
          )}
          <div className="customer-chat-order-info">
            <strong>Inquiring about: {chatOrderItem.title}</strong>
            <span>{chatOrderItem.variantLabel || 'Standard'} • {Number(chatOrderItem.price || 0).toLocaleString()} Ks</span>
          </div>
          <button type="button" className="customer-chat-order-clear" onClick={clearChatOrder}>
            ✕
          </button>
        </div>
      )}

      {/* Chat Messages Feed */}
      <div className="customer-chat-feed" ref={messagesFeedRef} onScroll={handleMessagesScroll}>
        {loadingOlder && <div className="chat-history-loading" role="status">Loading older messages…</div>}
        {historyError && <button type="button" className="chat-history-error" onClick={loadOlderMessages}>{historyError}</button>}
        {loading ? (
          <div className="customer-chat-empty">Loading chat history...</div>
        ) : messages.length === 0 ? (
          <div className="customer-chat-welcome">
            <div className="customer-chat-welcome-icon">
              <MessageCircle size={36} />
            </div>
            <h4>မင်္ဂလာပါ! ဘာအကူအညီလိုပါသလဲ?</h4>
            <p>
              နှုတ်ဆက်စကားပို့ပြီး စကားစတင်နိုင်သလို အရွယ်အစား၊ အဝတ်အစား၊ ပစ္စည်းလက်ကျန်၊ ပို့ဆောင်မှု သို့မဟုတ် အကောင့်ဝင်ခြင်းအကြောင်း မေးမြန်းနိုင်ပါတယ်။
              ကျွန်ုပ်တို့အဖွဲ့မှ အမြန်ဆုံး ပြန်လည်ဖြေကြားပေးပါမယ်။
            </p>
            <div className="customer-chat-prompts">
              <button
                type="button"
                onClick={() => setInputVal('မင်္ဂလာပါ၊ ဒီပစ္စည်း လက်ကျန်ရှိပါသလား?')}
              >
                ဒီပစ္စည်း လက်ကျန်ရှိပါသလား?
              </button>
              <button
                type="button"
                onClick={() => setInputVal('ပို့ဆောင်ချိန်နဲ့ ပို့ခ ဘယ်လောက်လဲ?')}
              >
                ပို့ဆောင်ချိန်နဲ့ ပို့ခ ဘယ်လောက်လဲ?
              </button>
              <button
                type="button"
                onClick={() => setInputVal('ကျွန်ုပ်အကောင့်နဲ့ ပတ်သက်ပြီး ကူညီပေးနိုင်မလား?')}
              >
                အကောင့်နဲ့ ပတ်သက်ပြီး အကူအညီလိုပါတယ်
              </button>
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMe = m.sender === 'customer'
            const timeStr = m.createdAt
              ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''
            return (
              <div key={m._id || idx} ref={node => { if (node && m._id) messageNodesRef.current[String(m._id)] = node }} className={`customer-chat-bubble-row ${isMe ? 'me' : 'support'}`}>
                <div className={`customer-chat-bubble ${isMe ? 'me-bubble' : 'support-bubble'}`} title={m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}>
                  {!isMe && <div className="bubble-sender-name">Win &amp; Chit Support</div>}
                  {m.imageUrl && (
                    <div className="customer-chat-bubble-image-wrap">
                      <a href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                        <img src={m.imageUrl} alt="Chat attachment" className="customer-chat-bubble-image" />
                      </a>
                    </div>
                  )}
                  {m.replyTo?.messageId && <button type="button" className="chat-quote" onClick={() => jumpToMessage(m.replyTo.messageId)}><strong>{m.replyTo.sender === 'admin' ? 'Win & Chit Support' : 'Customer'}</strong><span>{m.replyTo.text || 'Photo attachment'}</span></button>}
                  {m.text && <div className="bubble-content-text">{m.text.replace(/\n?\[ACCOUNT_ACTIONS\].*$/, '')}</div>}
                  {!isMe && isGuest && m.text?.includes('[ACCOUNT_ACTIONS]') && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <Link className="btn btn-secondary btn-sm" to="/account?mode=login">Login</Link>
                      <Link className="btn btn-primary btn-sm" to="/account?mode=signup">Sign up</Link>
                    </div>
                  )}
                  {highlightedMessageId === String(m._id) && <div className="chat-source-context">Original message · {new Date(m.createdAt).toLocaleString()}</div>}
                  <div className="bubble-time-text">{timeStr}</div>
                  <button type="button" className="chat-reply-btn" onClick={() => setReplyTarget(m)} title="Reply to this message"><Reply size={13} /></button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Selected Photo Attachment Preview Bar with Viber/Telegram style % Progress */}
      {selectedPhoto && (
        <div className="customer-chat-photo-preview-bar">
          <div className="customer-chat-photo-preview-card">
            <img src={selectedPhoto.previewUrl} alt="Preview" />
            {uploadingPhoto ? (
              <div className="photo-upload-progress-overlay">
                <div className="photo-progress-ring">
                  <span className="photo-progress-pct">{uploadProgress}%</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="customer-chat-photo-preview-remove"
                onClick={handleClearPhoto}
                title="Remove photo"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="customer-chat-photo-preview-info">
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

      {/* Chat Input Dock with Photo Icon OUTSIDE to the Left */}
      {replyTarget && <div className="chat-reply-preview"><Reply size={14} /><span>Replying to {replyTarget.sender === 'admin' ? 'Win & Chit Support' : 'your message'}: {replyTarget.text || 'Photo attachment'}</span><button type="button" onClick={() => setReplyTarget(null)}><X size={14} /></button></div>}
      <form className="customer-chat-input-dock" onSubmit={handleSendMessage}>
        {/* Hidden File Picker restricted to Photos only */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/jpg"
          style={{ display: 'none' }}
          onChange={handlePhotoSelect}
        />

        {/* Photo Action Button OUTSIDE input box (left side, matching Send button style) */}
        <button
          type="button"
          className="customer-chat-attach-outer-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach photo (Images only)"
          aria-label="Attach photo"
          disabled={sending || uploadingPhoto}
        >
          <ImageIcon size={20} />
        </button>

        {/* Main Text Input Field */}
        <input
          type="text"
          className="customer-chat-input"
          placeholder={selectedPhoto ? 'ဓာတ်ပုံအတွက် စာတန်းထည့်ပါ...' : 'မက်ဆေ့ချ် ရေးပါ...'}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || uploadingPhoto}
        />

        {/* Send Button on Right Side */}
        <button
          type="submit"
          className="customer-chat-send-btn"
          onClick={handleSendMessage}
          disabled={(!inputVal.trim() && !selectedPhoto) || sending || uploadingPhoto}
          aria-label="Send message"
        >
          {uploadingPhoto ? (
            <span className="btn-upload-pct">{uploadProgress}%</span>
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </div>
  )
}
