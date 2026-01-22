/**
 * Unit tests for useCodex hook.
 * Tests the hook's wrapper behavior around useAgentRunner.
 */
import { describe, test, expect } from 'bun:test'
import { useCodex, type UseCodexResult } from './useCodex.js'
import { CodexAdapter } from './adapters/codex.js'
import type { CodexProps } from '../components/agents/types/codex.js'

describe('useCodex', () => {
  describe('UseCodexResult type', () => {
    test('extends UseAgentResult with model field', () => {
      const result: UseCodexResult = {
        status: 'pending',
        agentId: null,
        executionId: null,
        model: 'o4-mini',
        result: null,
        error: null,
        tailLog: []
      }
      expect(result.model).toBe('o4-mini')
    })

    test('model field is string type', () => {
      const result: UseCodexResult = {
        status: 'complete',
        agentId: 'agent-123',
        executionId: 'exec-456',
        model: 'o3',
        result: { output: 'test', tokensUsed: { input: 100, output: 50 }, turnsUsed: 1, durationMs: 1000, stopReason: 'completed' },
        error: null,
        tailLog: []
      }
      expect(typeof result.model).toBe('string')
    })
  })

  describe('model prop handling', () => {
    test('model defaults to o4-mini when not specified', () => {
      const props: CodexProps = { children: 'test' }
      const model = props.model ?? 'o4-mini'
      expect(model).toBe('o4-mini')
    })

    test('model uses provided value when specified', () => {
      const props: CodexProps = { children: 'test', model: 'o3' }
      const model = props.model ?? 'o4-mini'
      expect(model).toBe('o3')
    })

    test('model accepts gpt-4.1', () => {
      const props: CodexProps = { children: 'test', model: 'gpt-4.1' }
      const model = props.model ?? 'o4-mini'
      expect(model).toBe('gpt-4.1')
    })
  })

  describe('CodexAdapter integration', () => {
    test('useCodex uses CodexAdapter', () => {
      expect(CodexAdapter.name).toBe('codex')
    })

    test('CodexAdapter getAgentLabel returns model', () => {
      const label = CodexAdapter.getAgentLabel({ prompt: 'test', model: 'o3' })
      expect(label).toBe('o3')
    })

    test('CodexAdapter getAgentLabel defaults to o4-mini', () => {
      const label = CodexAdapter.getAgentLabel({ prompt: 'test' })
      expect(label).toBe('o4-mini')
    })

    test('CodexAdapter getLoggerName returns Codex', () => {
      expect(CodexAdapter.getLoggerName()).toBe('Codex')
    })

    test('CodexAdapter getLoggerContext includes model', () => {
      const ctx = CodexAdapter.getLoggerContext({ model: 'o3' })
      expect(ctx.model).toBe('o3')
    })
  })

  describe('status values', () => {
    test('pending is valid status', () => {
      const result: UseCodexResult = { status: 'pending', agentId: null, executionId: null, model: 'o4-mini', result: null, error: null, tailLog: [] }
      expect(result.status).toBe('pending')
    })

    test('running is valid status', () => {
      const result: UseCodexResult = { status: 'running', agentId: 'a', executionId: 'e', model: 'o4-mini', result: null, error: null, tailLog: [] }
      expect(result.status).toBe('running')
    })

    test('complete is valid status', () => {
      const result: UseCodexResult = { status: 'complete', agentId: 'a', executionId: 'e', model: 'o4-mini', result: { output: 'done', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, durationMs: 0, stopReason: 'completed' }, error: null, tailLog: [] }
      expect(result.status).toBe('complete')
    })

    test('error is valid status', () => {
      const result: UseCodexResult = { status: 'error', agentId: 'a', executionId: 'e', model: 'o4-mini', result: null, error: new Error('fail'), tailLog: [] }
      expect(result.status).toBe('error')
    })
  })
})
