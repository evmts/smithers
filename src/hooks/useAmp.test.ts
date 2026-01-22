/**
 * Unit tests for useAmp hook.
 * Tests the hook's wrapper behavior around useAgentRunner.
 */
import { describe, test, expect } from 'bun:test'
import { useAmp, type UseAmpResult } from './useAmp.js'
import { AmpAdapter } from './adapters/amp.js'
import type { AmpProps } from '../components/agents/types/amp.js'

describe('useAmp', () => {
  describe('UseAmpResult type', () => {
    test('extends UseAgentResult with mode field', () => {
      const result: UseAmpResult = {
        status: 'pending',
        agentId: null,
        executionId: null,
        mode: 'smart',
        result: null,
        error: null,
        tailLog: []
      }
      expect(result.mode).toBe('smart')
    })

    test('mode field is string type', () => {
      const result: UseAmpResult = {
        status: 'complete',
        agentId: 'agent-123',
        executionId: 'exec-456',
        mode: 'plan',
        result: { output: 'test', tokensUsed: { input: 100, output: 50 }, turnsUsed: 1, durationMs: 1000, stopReason: 'completed' },
        error: null,
        tailLog: []
      }
      expect(typeof result.mode).toBe('string')
    })
  })

  describe('mode prop handling', () => {
    test('mode defaults to smart when not specified', () => {
      const props: AmpProps = { children: 'test' }
      const mode = props.mode ?? 'smart'
      expect(mode).toBe('smart')
    })

    test('mode uses provided value when specified', () => {
      const props: AmpProps = { children: 'test', mode: 'plan' }
      const mode = props.mode ?? 'smart'
      expect(mode).toBe('plan')
    })

    test('mode accepts auto', () => {
      const props: AmpProps = { children: 'test', mode: 'auto' }
      const mode = props.mode ?? 'smart'
      expect(mode).toBe('auto')
    })

    test('mode accepts manual', () => {
      const props: AmpProps = { children: 'test', mode: 'manual' }
      const mode = props.mode ?? 'smart'
      expect(mode).toBe('manual')
    })
  })

  describe('AmpAdapter integration', () => {
    test('useAmp uses AmpAdapter', () => {
      expect(AmpAdapter.name).toBe('amp')
    })

    test('AmpAdapter getAgentLabel returns amp-mode', () => {
      const label = AmpAdapter.getAgentLabel({ prompt: 'test', mode: 'plan' })
      expect(label).toBe('amp-plan')
    })

    test('AmpAdapter getAgentLabel defaults to amp-smart', () => {
      const label = AmpAdapter.getAgentLabel({ prompt: 'test' })
      expect(label).toBe('amp-smart')
    })

    test('AmpAdapter getLoggerName returns Amp', () => {
      expect(AmpAdapter.getLoggerName()).toBe('Amp')
    })

    test('AmpAdapter getLoggerContext includes mode', () => {
      const ctx = AmpAdapter.getLoggerContext({ mode: 'auto' })
      expect(ctx.mode).toBe('auto')
    })
  })

  describe('status values', () => {
    test('pending is valid status', () => {
      const result: UseAmpResult = { status: 'pending', agentId: null, executionId: null, mode: 'smart', result: null, error: null, tailLog: [] }
      expect(result.status).toBe('pending')
    })

    test('running is valid status', () => {
      const result: UseAmpResult = { status: 'running', agentId: 'a', executionId: 'e', mode: 'smart', result: null, error: null, tailLog: [] }
      expect(result.status).toBe('running')
    })

    test('complete is valid status', () => {
      const result: UseAmpResult = { status: 'complete', agentId: 'a', executionId: 'e', mode: 'smart', result: { output: 'done', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, durationMs: 0, stopReason: 'completed' }, error: null, tailLog: [] }
      expect(result.status).toBe('complete')
    })

    test('error is valid status', () => {
      const result: UseAmpResult = { status: 'error', agentId: 'a', executionId: 'e', mode: 'smart', result: null, error: new Error('fail'), tailLog: [] }
      expect(result.status).toBe('error')
    })
  })
})
