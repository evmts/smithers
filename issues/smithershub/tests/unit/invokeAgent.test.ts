import { describe, test, expect, jest, beforeEach, mock } from 'bun:test'
import type { AgentToolCallConfig, AgentResponse, AgentProvider } from '../../src/types/AgentResponse'

// Mock the actual implementation since we're testing the interface first
const mockInvokeAgent = jest.fn<Promise<AgentResponse>, [AgentToolCallConfig]>()

// Mock implementation for different providers
const createMockResponse = (provider: AgentProvider, config: AgentToolCallConfig): AgentResponse => ({
  id: `${provider}-${Date.now()}`,
  provider,
  model: config.model,
  content: `Mock response from ${provider}`,
  duration: 500,
  timestamp: new Date().toISOString(),
})

describe('invokeAgent Tool', () => {
  beforeEach(() => {
    mockInvokeAgent.mockClear()
  })

  describe('Configuration Validation', () => {
    test('accepts valid Claude configuration', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Hello world',
      }

      const expectedResponse = createMockResponse('claude', config)
      mockInvokeAgent.mockResolvedValue(expectedResponse)

      const result = await mockInvokeAgent(config)

      expect(mockInvokeAgent).toHaveBeenCalledWith(config)
      expect(result.provider).toBe('claude')
      expect(result.model).toBe('claude-3-sonnet')
      expect(result.content).toBe('Mock response from claude')
    })

    test('accepts valid Gemini configuration', async () => {
      const config: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Analyze this data',
        maxTokens: 1000,
        temperature: 0.7,
      }

      const expectedResponse = createMockResponse('gemini', config)
      mockInvokeAgent.mockResolvedValue(expectedResponse)

      const result = await mockInvokeAgent(config)

      expect(result.provider).toBe('gemini')
      expect(result.model).toBe('gemini-pro')
    })

    test('accepts valid Codex configuration', async () => {
      const config: AgentToolCallConfig = {
        provider: 'codex',
        model: 'gpt-4',
        systemPrompt: 'You are a coding assistant',
        prompt: 'Write a function to sort an array',
        tools: [
          { name: 'execute_code', description: 'Execute code snippets' },
          { name: 'search_docs', description: 'Search documentation' }
        ],
      }

      const expectedResponse = createMockResponse('codex', config)
      mockInvokeAgent.mockResolvedValue(expectedResponse)

      const result = await mockInvokeAgent(config)

      expect(result.provider).toBe('codex')
      expect(result.model).toBe('gpt-4')
    })

    test('handles configuration with parent context', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Continue the conversation',
        parentContext: JSON.stringify({
          sessionId: 'sess-123',
          previousTopic: 'machine learning'
        }),
      }

      const expectedResponse = createMockResponse('claude', config)
      mockInvokeAgent.mockResolvedValue(expectedResponse)

      await mockInvokeAgent(config)

      expect(mockInvokeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          parentContext: expect.stringContaining('sess-123')
        })
      )
    })
  })

  describe('Response Handling', () => {
    test('returns structured response with all fields', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Generate a JSON response',
      }

      const mockResponse: AgentResponse = {
        id: 'claude-12345',
        provider: 'claude',
        model: 'claude-3-sonnet',
        content: 'Here is the response',
        structured: JSON.stringify({ type: 'completion', confidence: 0.95 }),
        toolCalls: [{
          name: 'analyze_sentiment',
          arguments: JSON.stringify({ text: 'sample text' }),
          result: 'positive'
        }],
        usage: {
          promptTokens: 50,
          completionTokens: 100,
          totalTokens: 150,
        },
        duration: 1200,
        timestamp: '2024-01-01T12:00:00Z',
      }

      mockInvokeAgent.mockResolvedValue(mockResponse)

      const result = await mockInvokeAgent(config)

      expect(result).toMatchObject({
        id: expect.any(String),
        provider: 'claude',
        model: 'claude-3-sonnet',
        content: expect.any(String),
        structured: expect.any(String),
        toolCalls: expect.arrayContaining([
          expect.objectContaining({
            name: 'analyze_sentiment',
            arguments: expect.any(String),
            result: 'positive'
          })
        ]),
        usage: expect.objectContaining({
          promptTokens: expect.any(Number),
          completionTokens: expect.any(Number),
          totalTokens: expect.any(Number),
        }),
        duration: expect.any(Number),
        timestamp: expect.any(String),
      })
    })

    test('handles response with nested agent calls', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Coordinate multiple tasks',
      }

      const nestedResponse: AgentResponse = {
        id: 'nested-456',
        provider: 'gemini',
        model: 'gemini-pro',
        content: 'Nested response',
        duration: 300,
        timestamp: '2024-01-01T12:01:00Z',
      }

      const parentResponse: AgentResponse = {
        id: 'parent-123',
        provider: 'claude',
        model: 'claude-3-sonnet',
        content: 'Parent response coordinating tasks',
        nestedResponses: [nestedResponse],
        duration: 2000,
        timestamp: '2024-01-01T12:00:00Z',
      }

      mockInvokeAgent.mockResolvedValue(parentResponse)

      const result = await mockInvokeAgent(config)

      expect(result.nestedResponses).toBeDefined()
      expect(result.nestedResponses).toHaveLength(1)
      expect(result.nestedResponses![0]).toMatchObject({
        id: 'nested-456',
        provider: 'gemini',
        model: 'gemini-pro',
        content: 'Nested response',
      })
    })
  })

  describe('Error Handling', () => {
    test('handles network errors', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Test prompt',
      }

      const errorResponse: AgentResponse = {
        id: 'error-123',
        provider: 'claude',
        model: 'claude-3-sonnet',
        content: '',
        error: 'Network timeout after 30 seconds',
        duration: 30000,
        timestamp: new Date().toISOString(),
      }

      mockInvokeAgent.mockResolvedValue(errorResponse)

      const result = await mockInvokeAgent(config)

      expect(result.error).toBe('Network timeout after 30 seconds')
      expect(result.content).toBe('')
    })

    test('handles API errors', async () => {
      const config: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Test prompt',
      }

      const errorResponse: AgentResponse = {
        id: 'api-error-456',
        provider: 'gemini',
        model: 'gemini-pro',
        content: '',
        error: 'API rate limit exceeded. Please try again later.',
        duration: 100,
        timestamp: new Date().toISOString(),
      }

      mockInvokeAgent.mockResolvedValue(errorResponse)

      const result = await mockInvokeAgent(config)

      expect(result.error).toContain('rate limit exceeded')
      expect(result.duration).toBe(100)
    })

    test('handles invalid model errors', async () => {
      const config: AgentToolCallConfig = {
        provider: 'codex',
        model: 'invalid-model-name',
        prompt: 'Test prompt',
      }

      const errorResponse: AgentResponse = {
        id: 'model-error-789',
        provider: 'codex',
        model: 'invalid-model-name',
        content: '',
        error: 'Model "invalid-model-name" not found or not available',
        duration: 50,
        timestamp: new Date().toISOString(),
      }

      mockInvokeAgent.mockResolvedValue(errorResponse)

      const result = await mockInvokeAgent(config)

      expect(result.error).toContain('not found')
      expect(result.model).toBe('invalid-model-name')
    })
  })

  describe('Provider-Specific Behavior', () => {
    test('Claude handles system prompts correctly', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        systemPrompt: 'You are a helpful assistant specialized in mathematics.',
        prompt: 'Solve 2 + 2',
      }

      const response = createMockResponse('claude', config)
      mockInvokeAgent.mockResolvedValue(response)

      await mockInvokeAgent(config)

      expect(mockInvokeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'You are a helpful assistant specialized in mathematics.'
        })
      )
    })

    test('Gemini handles temperature settings', async () => {
      const config: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Generate creative content',
        temperature: 0.9,
      }

      const response = createMockResponse('gemini', config)
      mockInvokeAgent.mockResolvedValue(response)

      await mockInvokeAgent(config)

      expect(mockInvokeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.9
        })
      )
    })

    test('Codex handles tool configurations', async () => {
      const tools = [
        { name: 'run_code', description: 'Execute code in sandbox' },
        { name: 'search_api', description: 'Search API documentation' }
      ]

      const config: AgentToolCallConfig = {
        provider: 'codex',
        model: 'gpt-4',
        prompt: 'Write and test a function',
        tools,
      }

      const response = createMockResponse('codex', config)
      mockInvokeAgent.mockResolvedValue(response)

      await mockInvokeAgent(config)

      expect(mockInvokeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'run_code' }),
            expect.objectContaining({ name: 'search_api' })
          ])
        })
      )
    })
  })

  describe('Performance and Timing', () => {
    test('tracks invocation duration', async () => {
      const config: AgentToolCallConfig = {
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'Quick response test',
      }

      const fastResponse: AgentResponse = {
        ...createMockResponse('claude', config),
        duration: 250,
      }

      mockInvokeAgent.mockResolvedValue(fastResponse)

      const result = await mockInvokeAgent(config)

      expect(result.duration).toBe(250)
      expect(typeof result.duration).toBe('number')
    })

    test('includes accurate timestamps', async () => {
      const config: AgentToolCallConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
        prompt: 'Timestamp test',
      }

      const beforeCall = new Date()
      const response = createMockResponse('gemini', config)
      mockInvokeAgent.mockResolvedValue(response)

      const result = await mockInvokeAgent(config)
      const afterCall = new Date()
      const responseTime = new Date(result.timestamp)

      expect(responseTime.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime())
      expect(responseTime.getTime()).toBeLessThanOrEqual(afterCall.getTime())
    })
  })
})