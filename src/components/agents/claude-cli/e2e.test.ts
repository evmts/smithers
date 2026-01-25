/**
 * E2E tests for real agent CLI execution (no mocks)
 *
 * These tests actually execute the Claude CLI and require:
 * - ANTHROPIC_API_KEY environment variable
 * - Claude CLI installed and accessible
 *
 * Tests skip gracefully if API key is not available.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { executeClaudeCLI } from './executor.js'

// Force disable mock mode for these tests
delete process.env.SMITHERS_MOCK_MODE

const hasApiKey = !!process.env.ANTHROPIC_API_KEY

// Check if Claude CLI is installed
let hasClaudeCLI = false
beforeAll(async () => {
  if (!hasApiKey) {
    console.log('Skipping E2E tests: ANTHROPIC_API_KEY not set')
    return
  }
  try {
    const proc = Bun.spawn(['claude', '--version'], { stdout: 'pipe', stderr: 'pipe' })
    const exitCode = await proc.exited
    hasClaudeCLI = exitCode === 0
    if (!hasClaudeCLI) {
      console.log('Skipping E2E tests: Claude CLI not installed')
    }
  } catch {
    console.log('Skipping E2E tests: Claude CLI not available')
  }
})

const skipIfNoPrereqs = hasApiKey ? test : test.skip

describe('Agent Execution E2E', () => {
  skipIfNoPrereqs('Claude executes simple prompt and returns result', async () => {
    if (!hasClaudeCLI) return

    const result = await executeClaudeCLI({
      prompt: 'Reply with exactly this word and nothing else: HELLO',
      maxTurns: 1,
      outputFormat: 'text',
    })

    expect(result.output).toBeDefined()
    expect(result.output.length).toBeGreaterThan(0)
    expect(result.stopReason).not.toBe('error')
  }, 60000) // 60s timeout for real API call

  skipIfNoPrereqs('Claude handles structured JSON output', async () => {
    if (!hasClaudeCLI) return

    const result = await executeClaudeCLI({
      prompt: 'Return valid JSON with a single key "status" and value "ok". Only return the JSON, no explanation.',
      maxTurns: 1,
      outputFormat: 'json',
    })

    expect(result.stopReason).not.toBe('error')
    expect(result.output).toContain('status')
  }, 60000)

  skipIfNoPrereqs('Claude respects maxTurns=1 limit', async () => {
    if (!hasClaudeCLI) return

    const result = await executeClaudeCLI({
      prompt: 'Count from 1 to 10, one number at a time',
      maxTurns: 1,
    })

    expect(result.stopReason).not.toBe('error')
    expect(result.turnsUsed).toBeLessThanOrEqual(1)
  }, 60000)

  skipIfNoPrereqs('Claude tracks token usage', async () => {
    if (!hasClaudeCLI) return

    const result = await executeClaudeCLI({
      prompt: 'Say hello',
      maxTurns: 1,
      outputFormat: 'stream-json',
    })

    expect(result.stopReason).not.toBe('error')
    expect(result.tokensUsed).toBeDefined()
    expect(result.tokensUsed.input + result.tokensUsed.output).toBeGreaterThanOrEqual(0)
  }, 60000)

  skipIfNoPrereqs('Claude returns durationMs', async () => {
    if (!hasClaudeCLI) return

    const result = await executeClaudeCLI({
      prompt: 'Reply with OK',
      maxTurns: 1,
    })

    expect(result.durationMs).toBeDefined()
    expect(result.durationMs).toBeGreaterThan(0)
  }, 60000)
})

describe('Agent Error Handling E2E', () => {
  test('handles very short timeout gracefully', async () => {
    if (!hasApiKey || !hasClaudeCLI) return

    const result = await executeClaudeCLI({
      prompt: 'Write a very long essay about the history of computing',
      timeout: 100, // 100ms - will likely timeout
    })

    // Should either timeout or error, but not crash
    expect(result).toBeDefined()
    expect(result.output).toBeDefined()
  }, 5000)

  test('handles empty prompt', async () => {
    if (!hasApiKey || !hasClaudeCLI) return

    const result = await executeClaudeCLI({
      prompt: '',
      maxTurns: 1,
    })

    // Should handle gracefully (may error or complete)
    expect(result).toBeDefined()
    expect(result.output).toBeDefined()
  }, 60000)
})
