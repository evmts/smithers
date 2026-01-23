import { describe, test, expect } from 'bun:test'
import {
  AgentProvider,
  AgentToolCallConfig,
  AgentResponse,
  AgentStatus,
  AgentInvocationState,
} from '../../src/types/AgentResponse'

describe('AgentResponse Types', () => {
  describe('AgentProvider', () => {
    test('accepts valid providers', () => {
      expect(() => AgentProvider.parse('claude')).not.toThrow()
      expect(() => AgentProvider.parse('gemini')).not.toThrow()
      expect(() => AgentProvider.parse('codex')).not.toThrow()
    })

    test('rejects invalid providers', () => {
      expect(() => AgentProvider.parse('gpt')).toThrow()
      expect(() => AgentProvider.parse('unknown')).toThrow()
      expect(() => AgentProvider.parse('')).toThrow()
    })
  })

  describe('AgentToolCallConfig', () => {
    test('validates complete config', () => {
      const config = {
        provider: 'claude' as const,
        model: 'claude-3-sonnet',
        systemPrompt: 'You are a helpful assistant',
        prompt: 'Hello world',
        maxTokens: 1000,
        temperature: 0.7,
        tools: [{ name: 'search', description: 'Search tool' }],
        parentContext: JSON.stringify({ sessionId: '123', userId: 'user456' }),
      }

      expect(() => AgentToolCallConfig.parse(config)).not.toThrow()
      const parsed = AgentToolCallConfig.parse(config)
      expect(parsed.provider).toBe('claude')
      expect(parsed.model).toBe('claude-3-sonnet')
      expect(parsed.prompt).toBe('Hello world')
    })

    test('validates minimal config', () => {
      const config = {
        provider: 'gemini' as const,
        model: 'gemini-pro',
        prompt: 'Test prompt',
      }

      expect(() => AgentToolCallConfig.parse(config)).not.toThrow()
      const parsed = AgentToolCallConfig.parse(config)
      expect(parsed.systemPrompt).toBeUndefined()
      expect(parsed.maxTokens).toBeUndefined()
    })

    test('rejects invalid config', () => {
      // Missing required fields
      expect(() => AgentToolCallConfig.parse({})).toThrow()
      expect(() => AgentToolCallConfig.parse({ provider: 'claude' })).toThrow()

      // Invalid values
      expect(() => AgentToolCallConfig.parse({
        provider: 'invalid',
        model: 'test',
        prompt: 'test'
      })).toThrow()

      expect(() => AgentToolCallConfig.parse({
        provider: 'claude',
        model: '',
        prompt: 'test'
      })).toThrow()

      expect(() => AgentToolCallConfig.parse({
        provider: 'claude',
        model: 'test',
        prompt: ''
      })).toThrow()
    })

    test('validates optional numeric fields', () => {
      // Valid values
      expect(() => AgentToolCallConfig.parse({
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'test',
        maxTokens: 100,
        temperature: 0.5,
      })).not.toThrow()

      // Invalid values
      expect(() => AgentToolCallConfig.parse({
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'test',
        maxTokens: -1,
      })).toThrow()

      expect(() => AgentToolCallConfig.parse({
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'test',
        temperature: 1.5,
      })).toThrow()

      expect(() => AgentToolCallConfig.parse({
        provider: 'claude',
        model: 'claude-3-sonnet',
        prompt: 'test',
        temperature: -0.1,
      })).toThrow()
    })
  })

  describe('AgentResponse', () => {
    test('validates complete response', () => {
      const response = {
        id: 'agent-123',
        provider: 'claude' as const,
        model: 'claude-3-sonnet',
        content: 'Hello, how can I help?',
        structured: JSON.stringify({ intent: 'greeting', confidence: 0.9 }),
        toolCalls: [{
          name: 'search',
          arguments: JSON.stringify({ query: 'test', limit: 10 }),
          result: 'search completed'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        duration: 1500,
        timestamp: new Date().toISOString(),
      }

      expect(() => AgentResponse.parse(response)).not.toThrow()
      const parsed = AgentResponse.parse(response)
      expect(parsed.id).toBe('agent-123')
      expect(parsed.provider).toBe('claude')
      expect(parsed.content).toBe('Hello, how can I help?')
    })

    test('validates minimal response', () => {
      const response = {
        id: 'agent-456',
        provider: 'gemini' as const,
        model: 'gemini-pro',
        content: 'Response text',
        duration: 500,
        timestamp: new Date().toISOString(),
      }

      expect(() => AgentResponse.parse(response)).not.toThrow()
      const parsed = AgentResponse.parse(response)
      expect(parsed.structured).toBeUndefined()
      expect(parsed.toolCalls).toBeUndefined()
      expect(parsed.usage).toBeUndefined()
    })

    test('validates nested responses', () => {
      const nestedResponse = {
        id: 'nested-123',
        provider: 'codex' as const,
        model: 'gpt-4',
        content: 'Nested response',
        duration: 300,
        timestamp: new Date().toISOString(),
      }

      const response = {
        id: 'parent-123',
        provider: 'claude' as const,
        model: 'claude-3-sonnet',
        content: 'Parent response',
        duration: 1000,
        timestamp: new Date().toISOString(),
        nestedResponses: [nestedResponse],
      }

      expect(() => AgentResponse.parse(response)).not.toThrow()
      const parsed = AgentResponse.parse(response)
      expect(parsed.nestedResponses).toHaveLength(1)
      expect(parsed.nestedResponses![0].id).toBe('nested-123')
    })

    test('rejects invalid response', () => {
      // Missing required fields
      expect(() => AgentResponse.parse({})).toThrow()
      expect(() => AgentResponse.parse({ id: 'test' })).toThrow()

      // Invalid values
      expect(() => AgentResponse.parse({
        id: 'test',
        provider: 'invalid',
        model: 'test',
        content: 'test',
        duration: -1,
        timestamp: new Date().toISOString(),
      })).toThrow()

      expect(() => AgentResponse.parse({
        id: 'test',
        provider: 'claude',
        model: 'test',
        content: 'test',
        duration: 100,
        timestamp: 'invalid-date',
      })).toThrow()
    })
  })

  describe('AgentStatus', () => {
    test('accepts valid statuses', () => {
      expect(() => AgentStatus.parse('pending')).not.toThrow()
      expect(() => AgentStatus.parse('running')).not.toThrow()
      expect(() => AgentStatus.parse('completed')).not.toThrow()
      expect(() => AgentStatus.parse('error')).not.toThrow()
    })

    test('rejects invalid statuses', () => {
      expect(() => AgentStatus.parse('unknown')).toThrow()
      expect(() => AgentStatus.parse('')).toThrow()
    })
  })

  describe('AgentInvocationState', () => {
    test('validates complete state', () => {
      const config = {
        provider: 'claude' as const,
        model: 'claude-3-sonnet',
        prompt: 'test prompt',
      }

      const response = {
        id: 'response-123',
        provider: 'claude' as const,
        model: 'claude-3-sonnet',
        content: 'test response',
        duration: 1000,
        timestamp: new Date().toISOString(),
      }

      const state = {
        id: 'invoke-123',
        status: 'completed' as const,
        config,
        response,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        parentId: 'parent-456',
        childIds: ['child-1', 'child-2'],
      }

      expect(() => AgentInvocationState.parse(state)).not.toThrow()
      const parsed = AgentInvocationState.parse(state)
      expect(parsed.id).toBe('invoke-123')
      expect(parsed.status).toBe('completed')
      expect(parsed.childIds).toEqual(['child-1', 'child-2'])
    })

    test('validates minimal state', () => {
      const config = {
        provider: 'gemini' as const,
        model: 'gemini-pro',
        prompt: 'test',
      }

      const state = {
        id: 'invoke-456',
        status: 'pending' as const,
        config,
        startTime: new Date().toISOString(),
      }

      expect(() => AgentInvocationState.parse(state)).not.toThrow()
      const parsed = AgentInvocationState.parse(state)
      expect(parsed.response).toBeUndefined()
      expect(parsed.endTime).toBeUndefined()
      expect(parsed.parentId).toBeUndefined()
      expect(parsed.childIds).toEqual([]) // default value
    })

    test('rejects invalid state', () => {
      // Missing required fields
      expect(() => AgentInvocationState.parse({})).toThrow()

      const invalidConfig = { provider: 'invalid' }
      expect(() => AgentInvocationState.parse({
        id: 'test',
        status: 'pending',
        config: invalidConfig,
        startTime: new Date().toISOString(),
      })).toThrow()
    })
  })
})