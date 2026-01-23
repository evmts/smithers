/**
 * Tests for Claude agent executor
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { ClaudeAgentExecutor } from './claude-agent.js'
import type {
  AgentInvocation,
  AgentExecutionContext,
  AgentToolConfig
} from './types.js'

describe('ClaudeAgentExecutor', () => {
  let executor: ClaudeAgentExecutor
  let mockContext: AgentExecutionContext

  beforeEach(() => {
    executor = new ClaudeAgentExecutor()
    mockContext = {
      cwd: '/test/dir',
      env: {
        ANTHROPIC_API_KEY: 'test-api-key',
        NODE_ENV: 'test'
      },
      agentId: 'claude-test-123',
      executionId: 'exec-456',
      log: mock(() => {})
    }
  })

  describe('getDefaultConfig', () => {
    test('should return default Claude configuration', () => {
      const config = executor.getDefaultConfig()

      expect(config.model).toBe('claude-3-5-sonnet-20241022')
      expect(config.maxTokens).toBe(4000)
      expect(config.temperature).toBe(0.7)
    })
  })

  describe('validateConfig', () => {
    test('should accept valid configuration', () => {
      const config: AgentToolConfig = {
        provider: 'claude',
        model: 'claude-3-opus-20240229',
        maxTokens: 2000
      }

      expect(() => executor.validateConfig(config)).not.toThrow()
    })

    test('should throw error for missing model', () => {
      const config: AgentToolConfig = {
        provider: 'claude',
        model: ''
      }

      expect(() => executor.validateConfig(config)).toThrow('Model is required')
    })

    test('should throw error for invalid max tokens', () => {
      const config: AgentToolConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        maxTokens: -1
      }

      expect(() => executor.validateConfig(config)).toThrow('maxTokens must be positive')
    })

    test('should throw error for invalid temperature', () => {
      const config: AgentToolConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        temperature: 2.5
      }

      expect(() => executor.validateConfig(config)).toThrow('temperature must be between 0 and 1')
    })
  })

  describe('execute', () => {
    test('should execute successfully with basic prompt', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Write a hello world function in Python',
        config: {
          provider: 'claude',
          model: 'claude-3-sonnet',
          maxTokens: 1000
        }
      }

      // Mock the Anthropic API call
      const mockAnthropicClient = {
        messages: {
          create: mock(async () => ({
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'def hello_world():\n    print("Hello, World!")' }],
            model: 'claude-3-sonnet',
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
              input_tokens: 20,
              output_tokens: 30
            }
          }))
        }
      }

      // Mock the client creation
      const originalCreateClient = (executor as any).createClient
      ;(executor as any).createClient = () => mockAnthropicClient

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(true)
      expect(result.content).toContain('def hello_world')
      expect(result.usage?.inputTokens).toBe(20)
      expect(result.usage?.outputTokens).toBe(30)
      expect(result.usage?.totalTokens).toBe(50)
      expect(result.stopReason).toBe('completed')

      // Restore original method
      ;(executor as any).createClient = originalCreateClient
    })

    test('should handle API errors gracefully', async () => {
      const invocation: AgentInvocation = {
        prompt: 'This will fail',
        config: {
          provider: 'claude',
          model: 'claude-3-sonnet'
        }
      }

      // Mock API error
      const mockAnthropicClient = {
        messages: {
          create: mock(async () => {
            throw new Error('API rate limit exceeded')
          })
        }
      }

      const originalCreateClient = (executor as any).createClient
      ;(executor as any).createClient = () => mockAnthropicClient

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('API rate limit exceeded')
      expect(result.usage?.inputTokens).toBe(0)
      expect(result.usage?.outputTokens).toBe(0)

      // Restore original method
      ;(executor as any).createClient = originalCreateClient
    })

    test('should handle timeout correctly', async () => {
      const invocation: AgentInvocation = {
        prompt: 'This will timeout',
        config: {
          provider: 'claude',
          model: 'claude-3-sonnet',
          timeout: 100 // Very short timeout
        }
      }

      // Mock slow API response
      const mockAnthropicClient = {
        messages: {
          create: mock(async () => {
            await new Promise(resolve => setTimeout(resolve, 200))
            return {
              id: 'msg_123',
              content: [{ type: 'text', text: 'Response' }],
              usage: { input_tokens: 10, output_tokens: 5 }
            }
          })
        }
      }

      const originalCreateClient = (executor as any).createClient
      ;(executor as any).createClient = () => mockAnthropicClient

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
      expect(result.stopReason).toBe('timeout')

      // Restore original method
      ;(executor as any).createClient = originalCreateClient
    })

    test('should include system prompt in request', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Write code',
        config: {
          provider: 'claude',
          model: 'claude-3-sonnet',
          systemPrompt: 'You are an expert programmer.'
        }
      }

      const createSpy = mock(async () => ({
        id: 'msg_123',
        content: [{ type: 'text', text: 'Code here' }],
        usage: { input_tokens: 15, output_tokens: 10 }
      }))

      const mockAnthropicClient = {
        messages: { create: createSpy }
      }

      const originalCreateClient = (executor as any).createClient
      ;(executor as any).createClient = () => mockAnthropicClient

      await executor.execute(invocation, mockContext)

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are an expert programmer.',
          messages: [{ role: 'user', content: 'Write code' }]
        })
      )

      // Restore original method
      ;(executor as any).createClient = originalCreateClient
    })

    test('should handle missing API key', async () => {
      const contextWithoutKey = {
        ...mockContext,
        env: { NODE_ENV: 'test' } // No ANTHROPIC_API_KEY
      }

      const invocation: AgentInvocation = {
        prompt: 'Test prompt',
        config: {
          provider: 'claude',
          model: 'claude-3-sonnet'
        }
      }

      const result = await executor.execute(invocation, contextWithoutKey)

      expect(result.success).toBe(false)
      expect(result.error).toContain('ANTHROPIC_API_KEY')
    })

    test('should pass tools to the API', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Use tools to help me',
        config: {
          provider: 'claude',
          model: 'claude-3-sonnet',
          tools: ['bash', 'file_read']
        }
      }

      const createSpy = mock(async () => ({
        id: 'msg_123',
        content: [{ type: 'text', text: 'I can use tools' }],
        usage: { input_tokens: 25, output_tokens: 15 }
      }))

      const mockAnthropicClient = {
        messages: { create: createSpy }
      }

      const originalCreateClient = (executor as any).createClient
      ;(executor as any).createClient = () => mockAnthropicClient

      await executor.execute(invocation, mockContext)

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'bash' }),
            expect.objectContaining({ name: 'file_read' })
          ])
        })
      )

      // Restore original method
      ;(executor as any).createClient = originalCreateClient
    })
  })
})