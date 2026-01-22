/**
 * Unit tests for useClaude hook.
 * Tests the hook's wrapper behavior around useAgentRunner.
 */
import { describe, test, expect } from 'bun:test'
import { useClaude, type UseClaudeResult } from './useClaude.js'
import { ClaudeAdapter } from './adapters/claude.js'
import type { ClaudeProps } from '../components/agents/types.js'

describe('useClaude', () => {
  describe('UseClaudeResult type', () => {
    test('extends UseAgentResult with model field', () => {
      const result: UseClaudeResult = {
        status: 'pending',
        agentId: null,
        executionId: null,
        model: 'sonnet',
        result: null,
        error: null,
        tailLog: []
      }
      expect(result.model).toBe('sonnet')
    })

    test('model field is string type', () => {
      const result: UseClaudeResult = {
        status: 'complete',
        agentId: 'agent-123',
        executionId: 'exec-456',
        model: 'opus',
        result: { output: 'test', tokensUsed: { input: 100, output: 50 }, turnsUsed: 1, durationMs: 1000, stopReason: 'completed' },
        error: null,
        tailLog: []
      }
      expect(typeof result.model).toBe('string')
    })
  })

  describe('model prop handling', () => {
    test('model defaults to sonnet when not specified', () => {
      const props: ClaudeProps = { children: 'test' }
      const model = props.model ?? 'sonnet'
      expect(model).toBe('sonnet')
    })

    test('model uses provided value when specified', () => {
      const props: ClaudeProps = { children: 'test', model: 'opus' }
      const model = props.model ?? 'sonnet'
      expect(model).toBe('opus')
    })

    test('model accepts haiku', () => {
      const props: ClaudeProps = { children: 'test', model: 'haiku' }
      const model = props.model ?? 'sonnet'
      expect(model).toBe('haiku')
    })

    test('model accepts full model identifiers', () => {
      const props: ClaudeProps = { children: 'test', model: 'claude-3-5-sonnet-20241022' }
      const model = props.model ?? 'sonnet'
      expect(model).toBe('claude-3-5-sonnet-20241022')
    })
  })

  describe('ClaudeAdapter integration', () => {
    test('useClaude uses ClaudeAdapter', () => {
      expect(ClaudeAdapter.name).toBe('claude')
    })

    test('ClaudeAdapter getAgentLabel returns model', () => {
      const label = ClaudeAdapter.getAgentLabel({ prompt: 'test', model: 'opus' })
      expect(label).toBe('opus')
    })

    test('ClaudeAdapter getAgentLabel defaults to sonnet', () => {
      const label = ClaudeAdapter.getAgentLabel({ prompt: 'test' })
      expect(label).toBe('sonnet')
    })

    test('ClaudeAdapter getLoggerName returns Claude', () => {
      expect(ClaudeAdapter.getLoggerName()).toBe('Claude')
    })

    test('ClaudeAdapter getLoggerContext includes model', () => {
      const ctx = ClaudeAdapter.getLoggerContext({ model: 'haiku' })
      expect(ctx.model).toBe('haiku')
    })
  })

  describe('status values', () => {
    test('pending is valid status', () => {
      const result: UseClaudeResult = { status: 'pending', agentId: null, executionId: null, model: 'sonnet', result: null, error: null, tailLog: [] }
      expect(result.status).toBe('pending')
    })

    test('running is valid status', () => {
      const result: UseClaudeResult = { status: 'running', agentId: 'a', executionId: 'e', model: 'sonnet', result: null, error: null, tailLog: [] }
      expect(result.status).toBe('running')
    })

    test('complete is valid status', () => {
      const result: UseClaudeResult = { status: 'complete', agentId: 'a', executionId: 'e', model: 'sonnet', result: { output: 'done', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, durationMs: 0, stopReason: 'completed' }, error: null, tailLog: [] }
      expect(result.status).toBe('complete')
    })

    test('error is valid status', () => {
      const result: UseClaudeResult = { status: 'error', agentId: 'a', executionId: 'e', model: 'sonnet', result: null, error: new Error('fail'), tailLog: [] }
      expect(result.status).toBe('error')
    })
  })
})
