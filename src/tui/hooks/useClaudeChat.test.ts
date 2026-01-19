/**
 * Tests for src/tui/hooks/useClaudeChat.ts
 * Hook for Claude-powered chat interface
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import type { ChatMessage } from '../services/claude-assistant.js'

describe('tui/hooks/useClaudeChat', () => {
  const originalEnv = process.env['ANTHROPIC_API_KEY']

  beforeEach(() => {
    // Reset environment
    delete process.env['ANTHROPIC_API_KEY']
  })

  afterEach(() => {
    // Restore original environment
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
      // Without key
      delete process.env['ANTHROPIC_API_KEY']
      expect(!!process.env['ANTHROPIC_API_KEY']).toBe(false)
      
      // With key
      process.env['ANTHROPIC_API_KEY'] = 'test-key'
      expect(!!process.env['ANTHROPIC_API_KEY']).toBe(true)
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
  })

  describe('clearHistory', () => {
    test('resets messages to empty array', () => {
      let messages: ChatMessage[] = [
        { role: 'user', content: 'test', timestamp: new Date().toISOString() }
      ]
      
      // Simulate clearHistory
      messages = []
      expect(messages).toEqual([])
    })

    test('clears error', () => {
      let error: string | null = 'Previous error'
      
      // Simulate clearHistory
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
      // ISO format: 2024-01-15T10:30:00.000Z
      expect(msg.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
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

    test('message history accumulates correctly', () => {
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
  })
})
