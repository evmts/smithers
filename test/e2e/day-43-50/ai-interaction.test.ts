import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({
  program: { file: tuiBinary },
  rows: 40,
  columns: 120,
})

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test.describe('Day 43: Send to AI', () => {
  test('submit message shows loading indicator then response', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Submit a message
    await terminal.submit('hello')

    // Should show loading indicator (spinner or "thinking")
    await expect(terminal).toMatchSnapshot('after-submit')

    // Wait for response (in demo mode, should be fast)
    await delay(2000)

    // Should have some response content visible
    await expect(terminal).toMatchSnapshot('after-response')
  })
})

test.describe('Day 44: Cancel AI Request', () => {
  test('escape during loading cancels request', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Submit a message
    await terminal.submit('tell me a long story')

    // Immediately try to cancel
    await terminal.keyEscape()

    // Wait a moment for the cancellation to process
    await delay(1000)

    // Should show interrupted/cancelled state or return to idle
    await expect(terminal).toMatchSnapshot('after-cancel')
  })
})

test.describe('Day 45: Queue While Busy', () => {
  test('messages queued during loading', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Submit first message
    await terminal.submit('first message')

    // Try to write second message immediately (while potentially still loading)
    await terminal.write('second message')

    // Take snapshot to show queue behavior
    await expect(terminal).toMatchSnapshot('during-queue')

    await delay(3000)
    await expect(terminal).toMatchSnapshot('after-queue-processed')
  })
})

test.describe('Day 46: Streaming Response', () => {
  test('response streams incrementally', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Submit message
    await terminal.submit('hello')

    // Take snapshots during streaming to capture incremental updates
    await delay(100)
    await expect(terminal).toMatchSnapshot('mid-stream-1')

    await delay(500)
    await expect(terminal).toMatchSnapshot('mid-stream-2')

    await delay(2000)
    await expect(terminal).toMatchSnapshot('stream-complete')
  })
})

test.describe('Day 47: Tool Call Display', () => {
  test('tool calls are shown in UI', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Request that would trigger a tool call (file read)
    await terminal.submit('read file package.json')

    await delay(3000)

    // Should show tool call indicator or result
    await expect(terminal).toMatchSnapshot('after-tool-call')
  })
})

test.describe('Day 48: Error Handling', () => {
  test('API errors display gracefully', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // In demo mode, this should still work
    await terminal.submit('trigger error')

    await delay(2000)

    // Should show error message or graceful fallback
    await expect(terminal).toMatchSnapshot('error-handling')
  })
})

test.describe('Day 49: Demo Mode', () => {
  test('operates in demo mode without API key', async ({ terminal }) => {
    // TUI should start in demo mode when no ANTHROPIC_API_KEY
    await expect(terminal.getByText('>')).toBeVisible()

    // Check for demo mode indicator (use strict: false since "demo" appears multiple times)
    await expect(terminal.getByText('demo-mode', { strict: false })).toBeVisible()

    // Submit message - should get demo response
    await terminal.submit('hello in demo mode')

    await delay(2000)

    // Should show demo response (not error about missing API key)
    await expect(terminal).toMatchSnapshot('demo-mode-response')
  })
})

test.describe('Day 50: Long Response Auto-Scroll', () => {
  test('auto-scrolls during long streaming response', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Request that would generate a long response
    await terminal.submit('write a very long detailed response about programming')

    // Capture snapshots at intervals to verify scrolling
    await delay(500)
    await expect(terminal).toMatchSnapshot('long-response-1')

    await delay(1000)
    await expect(terminal).toMatchSnapshot('long-response-2')

    await delay(3000)
    await expect(terminal).toMatchSnapshot('long-response-final')
  })
})
