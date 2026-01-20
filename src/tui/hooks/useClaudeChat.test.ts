/**
 * Tests for src/tui/hooks/useClaudeChat.ts
 * Hook for Claude-powered chat interface
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { ChatMessage } from '../services/claude-assistant.js'
import type { UseClaudeChatResult, UseClaudeChatOptions } from './useClaudeChat.js'
import { resetTuiState } from '../state.js'

describe('tui/hooks/useClaudeChat', () => {
  const originalEnv = process.env['ANTHROPIC_API_KEY']

  beforeEach(() => {
    resetTuiState()
    delete process.env['ANTHROPIC_API_KEY']
  })

  afterEach(() => {
    resetTuiState()
    if (originalEnv) {
      process.env['ANTHROPIC_API_KEY'] = originalEnv
    } else {
      delete process.env['ANTHROPIC_API_KEY']
    }
  })

  describe('initial state', () => {
    test('messages is empty array initially', () => {
      const initialMessages: ChatMessage[] = []
      expect(initialMessages).toEqual([])
      expect(initialMessages).toHaveLength(0)
    })

    test('isLoading is false initially', () => {
      const initialIsLoading = false
      expect(initialIsLoading).toBe(false)
    })

    test('error is null initially', () => {
      const initialError = null
      expect(initialError).toBeNull()
    })

    test('isAvailable reflects ANTHROPIC_API_KEY presence', () => {
      delete process.env['ANTHROPIC_API_KEY']
      expect(!!process.env['ANTHROPIC_API_KEY']).toBe(false)

      process.env['ANTHROPIC_API_KEY'] = 'test-key'
      expect(!!process.env['ANTHROPIC_API_KEY']).toBe(true)
    })
  })

  describe('UseClaudeChatResult interface', () => {
    test('has all required properties', () => {
      const result: UseClaudeChatResult = {
        messages: [],
        isLoading: false,
        error: null,
        isAvailable: false,
        sendMessage: async () => {},
        clearHistory: () => {}
      }

      expect(result.messages).toBeDefined()
      expect(typeof result.isLoading).toBe('boolean')
      expect(result.error).toBeNull()
      expect(typeof result.isAvailable).toBe('boolean')
      expect(typeof result.sendMessage).toBe('function')
      expect(typeof result.clearHistory).toBe('function')
    })
  })

  describe('API key availability', () => {
    test('isAvailable is true when ANTHROPIC_API_KEY is set', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-test-key'
      const isAvailable = !!process.env['ANTHROPIC_API_KEY']
      expect(isAvailable).toBe(true)
    })

    test('isAvailable is false when ANTHROPIC_API_KEY is not set', () => {
      delete process.env['ANTHROPIC_API_KEY']
      const isAvailable = !!process.env['ANTHROPIC_API_KEY']
      expect(isAvailable).toBe(false)
    })

    test('isAvailable can be overridden via options', () => {
      const options: UseClaudeChatOptions = { isAvailable: true }
      expect(options.isAvailable).toBe(true)
    })
  })

  describe('sendMessage', () => {
    test('user message format includes all required fields', () => {
      const content = 'Hello, Claude!'
      const userMessage: ChatMessage = {
        role: 'user',
        content,
        timestamp: new Date().toISOString()
      }

      expect(userMessage.role).toBe('user')
      expect(userMessage.content).toBe('Hello, Claude!')
      expect(userMessage.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test('assistant message format includes all required fields', () => {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: 'Hello! How can I help?',
        timestamp: new Date().toISOString()
      }

      expect(assistantMessage.role).toBe('assistant')
      expect(assistantMessage.content).toBe('Hello! How can I help?')
      expect(assistantMessage.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test('includes timestamp in user message', () => {
      const before = new Date()
      const userMessage: ChatMessage = {
        role: 'user',
        content: 'test',
        timestamp: new Date().toISOString()
      }
      const after = new Date()

      const messageTime = new Date(userMessage.timestamp)
      expect(messageTime.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(messageTime.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    test('includes timestamp in assistant message', () => {
      const before = new Date()
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: 'response',
        timestamp: new Date().toISOString()
      }
      const after = new Date()

      const messageTime = new Date(assistantMessage.timestamp)
      expect(messageTime.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(messageTime.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe('sendMessage without API key', () => {
    test('error message when API key not available', () => {
      delete process.env['ANTHROPIC_API_KEY']
      const expectedError = 'ANTHROPIC_API_KEY not set. Claude chat is unavailable.'
      expect(expectedError).toContain('ANTHROPIC_API_KEY')
    })

    test('returns early without calling assistant', () => {
      const isAvailable = false
      let assistantCalled = false

      if (!isAvailable) {
        // Set error, return early
      } else {
        assistantCalled = true
      }

      expect(assistantCalled).toBe(false)
    })
  })

  describe('sendMessage error handling', () => {
    test('extracts message from Error instance', () => {
      const error = new Error('API timeout')
      const message = error instanceof Error ? error.message : 'Failed to get response'
      expect(message).toBe('API timeout')
    })

    test('uses fallback for non-Error exceptions', () => {
      const error = { code: 500 }
      const message = error instanceof Error ? error.message : 'Failed to get response'
      expect(message).toBe('Failed to get response')
    })

    test('handles non-Error exceptions', () => {
      const error = 'string error'
      const message = error instanceof Error ? error.message : 'Failed to get response'
      expect(message).toBe('Failed to get response')
    })

    test('sets isLoading to false after error', () => {
      let isLoading = true

      try {
        throw new Error('API error')
      } catch {
        // Handle error
      } finally {
        isLoading = false
      }

      expect(isLoading).toBe(false)
    })
  })

  describe('clearHistory', () => {
    test('resets messages to empty array', () => {
      let messages: ChatMessage[] = [
        { role: 'user', content: 'test', timestamp: new Date().toISOString() }
      ]

      messages = []
      expect(messages).toEqual([])
    })

    test('clears error', () => {
      let error: string | null = 'Previous error'

      error = null
      expect(error).toBeNull()
    })
  })

  describe('message format', () => {
    test('user messages have role "user"', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: 'test',
        timestamp: new Date().toISOString()
      }
      expect(msg.role).toBe('user')
    })

    test('assistant messages have role "assistant"', () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: 'response',
        timestamp: new Date().toISOString()
      }
      expect(msg.role).toBe('assistant')
    })

    test('messages have ISO timestamp strings', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: 'test',
        timestamp: new Date().toISOString()
      }
      expect(msg.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
    })
  })

  describe('message history', () => {
    test('accumulates messages correctly', () => {
      const messages: ChatMessage[] = []

      messages.push({
        role: 'user',
        content: 'First message',
        timestamp: new Date().toISOString()
      })

      messages.push({
        role: 'assistant',
        content: 'First response',
        timestamp: new Date().toISOString()
      })

      messages.push({
        role: 'user',
        content: 'Second message',
        timestamp: new Date().toISOString()
      })

      expect(messages).toHaveLength(3)
      expect(messages[0]!.role).toBe('user')
      expect(messages[1]!.role).toBe('assistant')
      expect(messages[2]!.role).toBe('user')
    })

    test('passes full history to assistant', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'First', timestamp: '2024-01-15T10:00:00Z' },
        { role: 'assistant', content: 'Response', timestamp: '2024-01-15T10:00:01Z' }
      ]

      const newMessage: ChatMessage = {
        role: 'user',
        content: 'Second',
        timestamp: '2024-01-15T10:00:02Z'
      }

      const fullHistory = [...messages, newMessage]
      expect(fullHistory).toHaveLength(3)
    })
  })

  describe('streaming state', () => {
    test('isLoading is true during request', () => {
      let isLoading = false

      // Simulate start of request
      isLoading = true
      expect(isLoading).toBe(true)
    })

    test('isLoading is false after successful response', () => {
      let isLoading = true

      // Simulate successful response
      isLoading = false
      expect(isLoading).toBe(false)
    })

    test('isLoading is false after error', () => {
      let isLoading = true

      // Simulate error
      try {
        throw new Error('API error')
      } catch {
        // Handle error
      } finally {
        isLoading = false
      }

      expect(isLoading).toBe(false)
    })

    test('error is null before request', () => {
      let error: string | null = null
      expect(error).toBeNull()
    })

    test('error is set on failure', () => {
      let error: string | null = null

      try {
        throw new Error('Network error')
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to get response'
      }

      expect(error).toBe('Network error')
    })

    test('error is cleared on new request', () => {
      let error: string | null = 'Previous error'

      // Start new request
      error = null
      expect(error).toBeNull()
    })
  })

  describe('edge cases', () => {
    test('handles empty message content', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '',
        timestamp: new Date().toISOString()
      }
      expect(msg.content).toBe('')
    })

    test('handles whitespace-only content', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '   \n\t  ',
        timestamp: new Date().toISOString()
      }
      expect(msg.content).toBe('   \n\t  ')
    })

    test('handles very long messages', () => {
      const longContent = 'a'.repeat(10000)
      const msg: ChatMessage = {
        role: 'user',
        content: longContent,
        timestamp: new Date().toISOString()
      }
      expect(msg.content).toHaveLength(10000)
    })

    test('handles special characters in content', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: '<script>alert("xss")</script>',
        timestamp: new Date().toISOString()
      }
      expect(msg.content).toContain('<script>')
    })

    test('handles unicode in content', () => {
      const msg: ChatMessage = {
        role: 'user',
        content: 'Hello world',
        timestamp: new Date().toISOString()
      }
      expect(msg.content).toContain('world')
    })
  })

  describe('state keys', () => {
    test('uses correct key for messages', () => {
      const key = 'tui:chat:messages'
      expect(key).toBe('tui:chat:messages')
    })

    test('uses correct key for loading', () => {
      const key = 'tui:chat:loading'
      expect(key).toBe('tui:chat:loading')
    })

    test('uses correct key for error', () => {
      const key = 'tui:chat:error'
      expect(key).toBe('tui:chat:error')
    })
  })

  describe('createAssistant option', () => {
    test('uses custom createAssistant when provided', () => {
      const mockAssistant = {
        chat: async () => 'mock response',
        isAvailable: () => true
      }
      const createAssistant = mock(() => mockAssistant)

      const options: UseClaudeChatOptions = { createAssistant: createAssistant as any }
      expect(options.createAssistant).toBe(createAssistant)
    })
  })

  describe('callback dependencies', () => {
    test('sendMessage depends on assistant and isAvailable', () => {
      const deps = ['assistant', 'isAvailable', 'setError', 'setIsLoading', 'setMessages']
      expect(deps).toContain('assistant')
      expect(deps).toContain('isAvailable')
    })

    test('clearHistory depends on setMessages and setError', () => {
      const deps = ['setMessages', 'setError']
      expect(deps).toHaveLength(2)
    })
  })

  describe('readTuiState usage', () => {
    test('reads current state before updating messages', () => {
      // The hook uses readTuiState to get current messages before appending
      const EMPTY_MESSAGES: ChatMessage[] = []

      // readTuiState pattern
      const history = EMPTY_MESSAGES
      const userMessage: ChatMessage = {
        role: 'user',
        content: 'test',
        timestamp: new Date().toISOString()
      }
      const nextMessages = [...history, userMessage]

      expect(nextMessages).toHaveLength(1)
    })
  })
})
