// Hook for Claude-powered chat interface
// Gracefully degrades when ANTHROPIC_API_KEY is not set

import { useState, useCallback } from 'react'
import type { SmithersDB } from '../../db/index.js'
import { createClaudeAssistant, type ChatMessage } from '../services/claude-assistant.js'

export interface UseClaudeChatResult {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  isAvailable: boolean
  sendMessage: (content: string) => Promise<void>
  clearHistory: () => void
}

export function useClaudeChat(db: SmithersDB): UseClaudeChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if API key is available
  const isAvailable = !!process.env['ANTHROPIC_API_KEY']

  const assistant = createClaudeAssistant(db)

  const sendMessage = useCallback(async (content: string) => {
    if (!isAvailable) {
      setError('ANTHROPIC_API_KEY not set. Claude chat is unavailable.')
      return
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    setError(null)

    try {
      const response = await assistant.chat([...messages, userMessage])
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get response')
    } finally {
      setIsLoading(false)
    }
  }, [messages, isAvailable, assistant])

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    error,
    isAvailable,
    sendMessage,
    clearHistory
  }
}
