/**
 * Tests for Codex agent executor
 * Note: Codex typically refers to Claude agents running under the codex.smith.ai service
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { CodexAgentExecutor } from './codex-agent.js'
import type {
  AgentInvocation,
  AgentExecutionContext,
  AgentToolConfig
} from './types.js'

describe('CodexAgentExecutor', () => {
  let executor: CodexAgentExecutor
  let mockContext: AgentExecutionContext

  beforeEach(() => {
    executor = new CodexAgentExecutor()
    mockContext = {
      cwd: '/test/dir',
      env: {
        CODEX_API_KEY: 'test-codex-key',
        CODEX_API_URL: 'https://api.codex.example.com',
        NODE_ENV: 'test'
      },
      agentId: 'codex-test-123',
      executionId: 'exec-456',
      log: mock(() => {})
    }
  })

  describe('getDefaultConfig', () => {
    test('should return default Codex configuration', () => {
      const config = executor.getDefaultConfig()

      expect(config.model).toBe('claude-3.5-sonnet')
      expect(config.maxTokens).toBe(4000)
      expect(config.temperature).toBe(0.1)
    })
  })

  describe('validateConfig', () => {
    test('should accept valid configuration', () => {
      const config: AgentToolConfig = {
        provider: 'codex',
        model: 'claude-3.5-sonnet',
        maxTokens: 2000
      }

      expect(() => executor.validateConfig(config)).not.toThrow()
    })

    test('should throw error for missing model', () => {
      const config: AgentToolConfig = {
        provider: 'codex',
        model: ''
      }

      expect(() => executor.validateConfig(config)).toThrow('Model is required')
    })

    test('should throw error for invalid max tokens', () => {
      const config: AgentToolConfig = {
        provider: 'codex',
        model: 'claude-3.5-sonnet',
        maxTokens: -1
      }

      expect(() => executor.validateConfig(config)).toThrow('maxTokens must be positive')
    })

    test('should throw error for invalid temperature', () => {
      const config: AgentToolConfig = {
        provider: 'codex',
        model: 'claude-3.5-sonnet',
        temperature: 1.5
      }

      expect(() => executor.validateConfig(config)).toThrow('temperature must be between 0 and 1')
    })
  })

  describe('execute', () => {
    test('should execute successfully with basic prompt', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Write a function to sort an array',
        config: {
          provider: 'codex',
          model: 'claude-3.5-sonnet',
          maxTokens: 1000
        }
      }

      // Mock the fetch response
      const mockResponse = {
        ok: true,
        json: async () => ({
          success: true,
          content: 'function sortArray(arr) { return arr.sort(); }',
          usage: {
            input_tokens: 15,
            output_tokens: 25,
            total_tokens: 40
          },
          execution_time: 1500,
          turns: 1,
          stop_reason: 'completed'
        })
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = mock(() => Promise.resolve(mockResponse as any))

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(true)
      expect(result.content).toContain('sortArray')
      expect(result.usage?.inputTokens).toBe(15)
      expect(result.usage?.outputTokens).toBe(25)
      expect(result.usage?.totalTokens).toBe(40)
      expect(result.stopReason).toBe('completed')

      globalThis.fetch = originalFetch
    })

    test('should handle API errors gracefully', async () => {
      const invocation: AgentInvocation = {
        prompt: 'This will fail',
        config: {
          provider: 'codex',
          model: 'claude-3.5-sonnet'
        }
      }

      // Mock API error response
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error occurred'
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = mock(() => Promise.resolve(mockResponse as any))

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('HTTP 500')
      expect(result.usage?.inputTokens).toBe(0)
      expect(result.usage?.outputTokens).toBe(0)

      globalThis.fetch = originalFetch
    })

    test('should handle network errors', async () => {
      const invocation: AgentInvocation = {
        prompt: 'This will fail',
        config: {
          provider: 'codex',
          model: 'claude-3.5-sonnet'
        }
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = mock(() => Promise.reject(new Error('Network connection failed')))

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network connection failed')

      globalThis.fetch = originalFetch
    })

    test('should handle timeout correctly', async () => {
      const invocation: AgentInvocation = {
        prompt: 'This will timeout',
        config: {
          provider: 'codex',
          model: 'claude-3.5-sonnet',
          timeout: 50 // Very short timeout
        }
      }

      // Mock that simulates timeout by rejecting with AbortError
      const originalFetch = globalThis.fetch
      globalThis.fetch = mock(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          }, 30) // Slightly before timeout to simulate abort
        })
      })

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/timeout|aborted/i)

      globalThis.fetch = originalFetch
    })

    test('should include system prompt in request', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Write code',
        config: {
          provider: 'codex',
          model: 'claude-3.5-sonnet',
          systemPrompt: 'You are a coding expert.'
        }
      }

      const fetchSpy = mock(() => Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          content: 'Code here',
          usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35 }
        })
      } as any))

      const originalFetch = globalThis.fetch
      globalThis.fetch = fetchSpy

      await executor.execute(invocation, mockContext)

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('api.codex.example.com'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"systemPrompt":"You are a coding expert."')
        })
      )

      globalThis.fetch = originalFetch
    })

    test('should handle missing API configuration', async () => {
      const contextWithoutConfig = {
        ...mockContext,
        env: { NODE_ENV: 'test' } // No CODEX_API_KEY or CODEX_API_URL
      }

      const invocation: AgentInvocation = {
        prompt: 'Test prompt',
        config: {
          provider: 'codex',
          model: 'claude-3.5-sonnet'
        }
      }

      const result = await executor.execute(invocation, contextWithoutConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('CODEX_API_KEY')
    })

    test('should pass tools in request', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Use tools to help me',
        config: {
          provider: 'codex',
          model: 'claude-3.5-sonnet',
          tools: ['bash', 'file_read']
        }
      }

      const fetchSpy = mock(() => Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          content: 'I can use tools',
          usage: { input_tokens: 30, output_tokens: 20, total_tokens: 50 }
        })
      } as any))

      const originalFetch = globalThis.fetch
      globalThis.fetch = fetchSpy

      await executor.execute(invocation, mockContext)

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"tools":["bash","file_read"]')
        })
      )

      globalThis.fetch = originalFetch
    })

    test('should handle Codex API error response format', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Test prompt',
        config: {
          provider: 'codex',
          model: 'claude-3.5-sonnet'
        }
      }

      // Mock Codex error response format
      const mockResponse = {
        ok: true,
        json: async () => ({
          success: false,
          error: 'Rate limit exceeded',
          usage: { input_tokens: 5, output_tokens: 0, total_tokens: 5 }
        })
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = mock(() => Promise.resolve(mockResponse as any))

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Rate limit exceeded')
      expect(result.usage?.inputTokens).toBe(5)

      globalThis.fetch = originalFetch
    })
  })
})