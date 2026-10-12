import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

const EMPTY_HISTORY = { messages: [], hasMore: false, loaded: false }
const ChatHistoryContext = createContext(null)

export function ChatHistoryProvider({ children }) {
  const [histories, setHistories] = useState({})

  const updateHistory = useCallback((conversationId, update) => {
    if (!conversationId) return
    setHistories(previous => {
      const current = previous[conversationId] || EMPTY_HISTORY
      const changes = typeof update === 'function' ? update(current) : update
      return { ...previous, [conversationId]: { ...current, ...changes } }
    })
  }, [])

  const value = useMemo(() => ({ histories, updateHistory }), [histories, updateHistory])
  return <ChatHistoryContext.Provider value={value}>{children}</ChatHistoryContext.Provider>
}

export function useChatHistory(conversationId) {
  const context = useContext(ChatHistoryContext)
  if (!context) throw new Error('useChatHistory must be used within ChatHistoryProvider')

  const history = context.histories[conversationId] || EMPTY_HISTORY
  const updateField = (field, value) => context.updateHistory(conversationId, current => ({
    [field]: typeof value === 'function' ? value(current[field]) : value
  }))

  return {
    messages: history.messages,
    setMessages: value => updateField('messages', value),
    hasMoreMessages: history.hasMore,
    setHasMoreMessages: value => updateField('hasMore', value),
    historyLoaded: history.loaded,
    setHistoryLoaded: value => updateField('loaded', value)
  }
}
