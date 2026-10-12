export function parseChatMessagePage(payload, pageSize = 50) {
  if (Array.isArray(payload)) {
    return { messages: payload.slice(-pageSize), hasMore: false }
  }
  if (!payload || !Array.isArray(payload.messages)) {
    throw new Error('Invalid chat message page response')
  }
  return { messages: payload.messages, hasMore: Boolean(payload.hasMore) }
}

export function compareChatMessages(a, b) {
  const aTime = new Date(a.createdAt || 0).getTime()
  const bTime = new Date(b.createdAt || 0).getTime()
  return aTime - bTime || String(a._id || '').localeCompare(String(b._id || ''))
}

function uniqueSortedMessages(messages) {
  const unique = new Map()
  messages.forEach((message, index) => {
    const key = message._id ? String(message._id) : `pending-${index}`
    unique.set(key, message)
  })
  return [...unique.values()].sort(compareChatMessages)
}

export function mergeOlderChatMessages(existing, olderBatch) {
  if (!olderBatch.length) return existing
  return uniqueSortedMessages([...olderBatch, ...existing])
}

export function mergeLatestChatMessages(existing, latestBatch) {
  if (!latestBatch.length) return existing

  const boundary = latestBatch[0]
  const earlier = existing.filter(message => compareChatMessages(message, boundary) < 0)
  const currentLatest = existing
    .filter(message => !String(message._id || '').startsWith('temp_') && compareChatMessages(message, boundary) >= 0)
    .sort(compareChatMessages)
  const pending = existing.filter(message => String(message._id || '').startsWith('temp_'))
  const latestIsUnchanged = currentLatest.length === latestBatch.length &&
    latestBatch.every((message, index) => String(currentLatest[index]._id) === String(message._id))

  if (latestIsUnchanged && pending.length === 0) return existing
  return uniqueSortedMessages([...earlier, ...latestBatch, ...pending])
}
