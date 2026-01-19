// Hook for Claude-powered chat interface
// Gracefully degrades when ANTHROPIC_API_KEY is not set

import { useCallback, useMemo } from 'react'
import type { SmithersDB } from '../../db/index.js'
import { createClaudeAssistant, type ChatMessage } from '../services/claude-assistant.js'
import { readTuiState, useTuiState } from '../state.js'

export interface UseClaudeChatResult {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  isAvailable: boolean
  sendMessage: (content: string) => Promise<void>
  clearHistory: () => void
}

export interface UseClaudeChatOptions {
  createAssistant?: typeof createClaudeAssistant
  isAvailable?: boolean
}

const MESSAGES_KEY = 'tui:chat:messages'
const LOADING_KEY = 'tui:chat:loading'
const ERROR_KEY = 'tui:chat:error'
const EMPTY_MESSAGES: ChatMessage[] = []

export function useClaudeChat(db: SmithersDB, options: UseClaudeChatOptions = {}): UseClaudeChatResult {
  const [messages, setMessages] = useTuiState<ChatMessage[]>(MESSAGES_KEY, EMPTY_MESSAGES)
  const [isLoading, setIsLoading] = useTuiState<boolean>(LOADING_KEY, false)
  const [error, setError] = useTuiState<string | null>(ERROR_KEY, null)

  // Check if API key is available
  const isAvailable = options.isAvailable ?? !!process.env['ANTHROPIC_API_KEY']

  const assistantFactory = options.createAssistant ?? createClaudeAssistant
  const assistant = useMemo(() => assistantFactory(db), [assistantFactory, db])

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

    const history = readTuiState(MESSAGES_KEY, EMPTY_MESSAGES)
    const nextMessages = [...history, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)
    setError(null)

    try {
      const response = await assistant.chat(nextMessages)
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
  }, [assistant, isAvailable, setError, setIsLoading, setMessages])

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
  }, [setMessages, setError])

  return {
    messages,
    isLoading,
    error,
    isAvailable,
    sendMessage,
    clearHistory
  }
}
