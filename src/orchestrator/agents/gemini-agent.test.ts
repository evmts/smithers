/**
 * Tests for Gemini agent executor
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { GeminiAgentExecutor } from './gemini-agent.js'
import type {
  AgentInvocation,
  AgentExecutionContext,
  AgentToolConfig
} from './types.js'

describe('GeminiAgentExecutor', () => {
  let executor: GeminiAgentExecutor
  let mockContext: AgentExecutionContext

  beforeEach(() => {
    executor = new GeminiAgentExecutor()
    mockContext = {
      cwd: '/test/dir',
      env: {
        GOOGLE_API_KEY: 'test-google-key',
        NODE_ENV: 'test'
      },
      agentId: 'gemini-test-123',
      executionId: 'exec-456',
      log: mock(() => {})
    }
  })

  describe('getDefaultConfig', () => {
    test('should return default Gemini configuration', () => {
      const config = executor.getDefaultConfig()

      expect(config.model).toBe('gemini-1.5-flash')
      expect(config.maxTokens).toBe(8192)
      expect(config.temperature).toBe(0.7)
    })
  })

  describe('validateConfig', () => {
    test('should accept valid configuration', () => {
      const config: AgentToolConfig = {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        maxTokens: 2000
      }

      expect(() => executor.validateConfig(config)).not.toThrow()
    })

    test('should throw error for missing model', () => {
      const config: AgentToolConfig = {
        provider: 'gemini',
        model: ''
      }

      expect(() => executor.validateConfig(config)).toThrow('Model is required')
    })

    test('should throw error for invalid max tokens', () => {
      const config: AgentToolConfig = {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        maxTokens: -1
      }

      expect(() => executor.validateConfig(config)).toThrow('maxTokens must be positive')
    })

    test('should throw error for invalid temperature', () => {
      const config: AgentToolConfig = {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        temperature: 3.0
      }

      expect(() => executor.validateConfig(config)).toThrow('temperature must be between 0 and 2')
    })
  })

  describe('execute', () => {
    test('should execute successfully with basic prompt', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Explain quantum computing',
        config: {
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          maxTokens: 1000
        }
      }

      // Mock Google AI SDK response
      const mockResponse = {
        response: {
          text: () => 'Quantum computing is a revolutionary technology...',
          candidates: [{
            content: {
              parts: [{ text: 'Quantum computing is a revolutionary technology...' }]
            },
            finishReason: 'STOP'
          }],
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 45,
            totalTokenCount: 60
          }
        }
      }

      const mockGenerateContent = mock(() => Promise.resolve(mockResponse))
      const mockModel = {
        generateContent: mockGenerateContent
      }

      const originalCreateModel = (executor as any).createModel
      ;(executor as any).createModel = () => mockModel

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(true)
      expect(result.content).toContain('Quantum computing')
      expect(result.usage?.inputTokens).toBe(15)
      expect(result.usage?.outputTokens).toBe(45)
      expect(result.usage?.totalTokens).toBe(60)
      expect(result.stopReason).toBe('completed')

      // Restore original method
      ;(executor as any).createModel = originalCreateModel
    })

    test('should handle API errors gracefully', async () => {
      const invocation: AgentInvocation = {
        prompt: 'This will fail',
        config: {
          provider: 'gemini',
          model: 'gemini-1.5-flash'
        }
      }

      // Mock API error
      const mockModel = {
        generateContent: mock(() => {
          throw new Error('API quota exceeded')
        })
      }

      const originalCreateModel = (executor as any).createModel
      ;(executor as any).createModel = () => mockModel

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('API quota exceeded')
      expect(result.usage?.inputTokens).toBe(0)
      expect(result.usage?.outputTokens).toBe(0)

      // Restore original method
      ;(executor as any).createModel = originalCreateModel
    })

    test('should handle timeout correctly', async () => {
      const invocation: AgentInvocation = {
        prompt: 'This will timeout',
        config: {
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          timeout: 100 // Very short timeout
        }
      }

      // Mock slow API response
      const mockModel = {
        generateContent: mock(() => {
          return new Promise(resolve => {
            setTimeout(() => resolve({
              response: {
                text: () => 'Response',
                usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
              }
            }), 200)
          })
        })
      }

      const originalCreateModel = (executor as any).createModel
      ;(executor as any).createModel = () => mockModel

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/timeout|aborted/i)

      // Restore original method
      ;(executor as any).createModel = originalCreateModel
    })

    test('should include system prompt in request', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Write a story',
        config: {
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          systemPrompt: 'You are a creative writer.'
        }
      }

      const generateContentSpy = mock(() => Promise.resolve({
        response: {
          text: () => 'Once upon a time...',
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 25, totalTokenCount: 45 }
        }
      }))

      const mockModel = {
        generateContent: generateContentSpy
      }

      const originalCreateModel = (executor as any).createModel
      ;(executor as any).createModel = () => mockModel

      await executor.execute(invocation, mockContext)

      expect(generateContentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining('You are a creative writer')
                })
              ])
            })
          ])
        })
      )

      // Restore original method
      ;(executor as any).createModel = originalCreateModel
    })

    test('should handle missing API key', async () => {
      const contextWithoutKey = {
        ...mockContext,
        env: { NODE_ENV: 'test' } // No GOOGLE_API_KEY
      }

      const invocation: AgentInvocation = {
        prompt: 'Test prompt',
        config: {
          provider: 'gemini',
          model: 'gemini-1.5-flash'
        }
      }

      const result = await executor.execute(invocation, contextWithoutKey)

      expect(result.success).toBe(false)
      expect(result.error).toContain('GOOGLE_API_KEY')
    })

    test('should handle safety blocking', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Potentially harmful content',
        config: {
          provider: 'gemini',
          model: 'gemini-1.5-flash'
        }
      }

      // Mock safety-blocked response
      const mockResponse = {
        response: {
          text: () => '',
          candidates: [{
            content: null,
            finishReason: 'SAFETY'
          }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 0,
            totalTokenCount: 10
          }
        }
      }

      const mockModel = {
        generateContent: mock(() => Promise.resolve(mockResponse))
      }

      const originalCreateModel = (executor as any).createModel
      ;(executor as any).createModel = () => mockModel

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('safety')
      expect(result.usage?.inputTokens).toBe(10)
      expect(result.usage?.outputTokens).toBe(0)

      // Restore original method
      ;(executor as any).createModel = originalCreateModel
    })

    test('should pass generation config', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Generate creative content',
        config: {
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          temperature: 0.8,
          maxTokens: 500
        }
      }

      const generateContentSpy = mock(() => Promise.resolve({
        response: {
          text: () => 'Creative content here',
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 20, totalTokenCount: 35 }
        }
      }))

      const mockModel = {
        generateContent: generateContentSpy
      }

      const originalCreateModel = (executor as any).createModel
      ;(executor as any).createModel = () => mockModel

      await executor.execute(invocation, mockContext)

      expect(generateContentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            temperature: 0.8,
            maxOutputTokens: 500
          })
        })
      )

      // Restore original method
      ;(executor as any).createModel = originalCreateModel
    })

    test('should handle empty response', async () => {
      const invocation: AgentInvocation = {
        prompt: 'Test prompt',
        config: {
          provider: 'gemini',
          model: 'gemini-1.5-flash'
        }
      }

      // Mock empty response
      const mockResponse = {
        response: {
          text: () => '',
          candidates: [{
            content: { parts: [] },
            finishReason: 'STOP'
          }],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 0,
            totalTokenCount: 5
          }
        }
      }

      const mockModel = {
        generateContent: mock(() => Promise.resolve(mockResponse))
      }

      const originalCreateModel = (executor as any).createModel
      ;(executor as any).createModel = () => mockModel

      const result = await executor.execute(invocation, mockContext)

      expect(result.success).toBe(true)
      expect(result.content).toBe('')
      expect(result.stopReason).toBe('completed')

      // Restore original method
      ;(executor as any).createModel = originalCreateModel
    })
  })
})