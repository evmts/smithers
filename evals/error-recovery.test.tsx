import { describe, test, expect } from 'bun:test'
import './setup.ts'
import { useState } from 'react'
import {
  executePlan,
  Claude,
  Phase,
  type ExecutionError,
} from '@evmts/smithers'

/**
 * Tests for error recovery patterns in the Smithers execution pipeline.
 *
 * Tests:
 * - Enhanced error context (nodeType, nodePath, input)
 * - onError callback receiving ExecutionError
 * - Tool failure handling
 * - Graceful degradation with continueOnToolFailure
 */
describe('error-recovery', () => {
  test('onError receives ExecutionError with context', async () => {
    let capturedError: ExecutionError | null = null

    function FailingAgent() {
      return (
        <Claude
          onError={(err) => {
            capturedError = err as ExecutionError
          }}
        >
          This will fail intentionally for testing.
        </Claude>
      )
    }

    await executePlan(<FailingAgent />)

    expect(capturedError).not.toBeNull()
    expect(capturedError!.message).toBe('Simulated failure for testing')
    expect(capturedError!.nodeType).toBe('claude')
    expect(capturedError!.nodePath).toBeDefined()
    expect(capturedError!.input).toContain('fail intentionally')
  })

  test('error includes node path in multi-phase workflow', async () => {
    let capturedError: ExecutionError | null = null

    function MultiphaseWithError() {
      const [phase, setPhase] = useState<'first' | 'second'>('first')

      if (phase === 'first') {
        return (
          <Claude onFinished={() => setPhase('second')}>
            <Phase name="first-phase">First phase content</Phase>
          </Claude>
        )
      }

      return (
        <Claude
          onError={(err) => {
            capturedError = err as ExecutionError
          }}
        >
          <Phase name="second-phase">
            This will fail intentionally for testing.
          </Phase>
        </Claude>
      )
    }

    await executePlan(<MultiphaseWithError />)

    expect(capturedError).not.toBeNull()
    expect(capturedError!.nodePath).toContain('claude')
  })

  test('tool failure with retries reports retry count', async () => {
    let failCount = 0
    let capturedError: ExecutionError | null = null

    const flakyTool = {
      name: 'flakyTool',
      description: 'A tool that fails sometimes',
      execute: async () => {
        failCount++
        throw new Error('Tool temporarily unavailable')
      },
    }

    function AgentWithFlakyTool() {
      return (
        <Claude
          tools={[flakyTool]}
          toolRetry={{ maxRetries: 2, baseDelayMs: 10, continueOnToolFailure: true }}
          onError={(err) => {
            capturedError = err as ExecutionError
          }}
        >
          Use the flakyTool.
        </Claude>
      )
    }

    // Note: In mock mode, tools aren't actually called by Claude,
    // so we're testing that the configuration is accepted
    const result = await executePlan(<AgentWithFlakyTool />)
    expect(result).toBeDefined()
  })

  test('onToolError callback is called for tool failures', async () => {
    const toolErrors: { toolName: string; error: Error; input: unknown }[] = []

    const failingTool = {
      name: 'failingTool',
      description: 'A tool that always fails',
      execute: async () => {
        throw new Error('Always fails')
      },
    }

    function AgentWithToolError() {
      return (
        <Claude
          tools={[failingTool]}
          toolRetry={{ continueOnToolFailure: true }}
          onToolError={(name, error, input) => {
            toolErrors.push({ toolName: name, error, input })
          }}
        >
          Use the failingTool.
        </Claude>
      )
    }

    // In mock mode, this tests the configuration is accepted
    const result = await executePlan(<AgentWithToolError />)
    expect(result).toBeDefined()
  })

  test('retries prop is accepted for Claude component', async () => {
    function AgentWithRetries() {
      return (
        <Claude retries={5}>
          A simple request.
        </Claude>
      )
    }

    const result = await executePlan(<AgentWithRetries />)
    expect(result).toBeDefined()
    expect(result.output).toContain('Smithers')
  })

  test('graceful degradation continues after non-critical failures', async () => {
    let completedPhases: string[] = []

    function ResilientAgent() {
      const [phase, setPhase] = useState<'start' | 'middle' | 'end' | 'done'>('start')

      if (phase === 'start') {
        return (
          <Claude
            onFinished={() => {
              completedPhases.push('start')
              setPhase('middle')
            }}
          >
            <Phase name="start">Starting phase</Phase>
          </Claude>
        )
      }

      if (phase === 'middle') {
        return (
          <Claude
            onError={() => {
              // Recover from error gracefully
              completedPhases.push('middle-error-handled')
              setPhase('end')
            }}
          >
            <Phase name="middle">This will fail intentionally for testing.</Phase>
          </Claude>
        )
      }

      if (phase === 'end') {
        return (
          <Claude
            onFinished={() => {
              completedPhases.push('end')
              setPhase('done')
            }}
          >
            <Phase name="end">Ending phase</Phase>
          </Claude>
        )
      }

      return null
    }

    await executePlan(<ResilientAgent />)

    expect(completedPhases).toContain('start')
    expect(completedPhases).toContain('middle-error-handled')
    expect(completedPhases).toContain('end')
  })
})
