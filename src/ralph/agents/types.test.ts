import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { AgentType, AgentInvocationRequest, AgentResponse, validateAgentType, validateInvocationRequest, AgentInvocationRequestSchema, AgentResponseSchema } from './types.js'

describe('Agent Types', () => {
  test('AgentType enum contains expected values', () => {
    expect(AgentType.CLAUDE).toBe('claude')
    expect(AgentType.GEMINI).toBe('gemini')
    expect(AgentType.CODEX).toBe('codex')
  })

  test('validates valid agent type', () => {
    expect(validateAgentType('claude')).toBe(true)
    expect(validateAgentType('gemini')).toBe(true)
    expect(validateAgentType('codex')).toBe(true)
  })

  test('rejects invalid agent type', () => {
    expect(validateAgentType('invalid')).toBe(false)
    expect(validateAgentType('')).toBe(false)
    expect(validateAgentType(undefined)).toBe(false)
  })

  test('AgentInvocationRequest schema validation', () => {
    const validRequest: AgentInvocationRequest = {
      agentType: 'claude',
      prompt: 'Test prompt',
      model: 'sonnet',
      maxTokens: 1000,
      temperature: 0.7,
      tools: ['bash', 'read'],
      timeout: 30000,
      metadata: { sessionId: 'test-123' }
    }

    expect(() => AgentInvocationRequestSchema.parse(validRequest)).not.toThrow()
  })

  test('AgentInvocationRequest requires agent type and prompt', () => {
    const invalidRequest = {
      prompt: 'Test prompt'
      // Missing agentType
    }

    expect(() => AgentInvocationRequestSchema.parse(invalidRequest)).toThrow()
  })

  test('AgentResponse schema validation', () => {
    const successResponse: AgentResponse = {
      success: true,
      result: 'Agent completed successfully',
      agentType: 'claude',
      executionTime: 15000,
      tokensUsed: 500,
      toolCalls: [
        {
          name: 'bash',
          input: { command: 'ls' },
          output: 'file1.txt\nfile2.txt'
        }
      ]
    }

    const errorResponse: AgentResponse = {
      success: false,
      error: 'Agent failed with timeout',
      agentType: 'gemini',
      executionTime: 30000
    }

    expect(() => AgentResponseSchema.parse(successResponse)).not.toThrow()
    expect(() => AgentResponseSchema.parse(errorResponse)).not.toThrow()
  })

  test('validateInvocationRequest validates required fields', () => {
    const validRequest = {
      agentType: 'claude' as const,
      prompt: 'Test prompt'
    }

    const invalidRequests = [
      { agentType: 'invalid', prompt: 'Test' },
      { agentType: 'claude' }, // missing prompt
      { prompt: 'Test' }, // missing agentType
      {}
    ]

    expect(validateInvocationRequest(validRequest)).toBe(true)

    for (const request of invalidRequests) {
      expect(validateInvocationRequest(request)).toBe(false)
    }
  })
})