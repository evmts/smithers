import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import React from 'react'
import type { SmithersDB } from '../../db/index.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../test-utils.js'
import { useClaudeChat, type UseClaudeChatResult } from './useClaudeChat.js'

function ClaudeChatHarness({
  db,
  onResult,
  options,
}: {
  db: SmithersDB
  onResult: (result: UseClaudeChatResult) => void
  options?: Parameters<typeof useClaudeChat>[1]
}) {
  const result = useClaudeChat(db, options)
  onResult(result)
  return <test-hook />
}

describe('useClaudeChat', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('reports unavailable when API key missing', async () => {
    let latest: UseClaudeChatResult | null = null

    await ctx.root.render(
      <ClaudeChatHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
        options={{ isAvailable: false, createAssistant: () => ({ chat: async () => 'x', isAvailable: () => false }) }}
      />
    )

    await waitForEffects()
    await latest!.sendMessage('hello')
    await waitForEffects()

    expect(latest!.isAvailable).toBe(false)
    expect(latest!.messages).toHaveLength(0)
    expect(latest!.error).toContain('ANTHROPIC_API_KEY')
  })

  test('sends message and appends assistant response', async () => {
    const chat = mock(async () => 'assistant reply')
    const assistant = { chat, isAvailable: () => true }
    let latest: UseClaudeChatResult | null = null

    await ctx.root.render(
      <ClaudeChatHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
        options={{ isAvailable: true, createAssistant: () => assistant }}
      />
    )

    await waitForEffects()
    await latest!.sendMessage('hello')
    await waitForEffects()

    expect(chat).toHaveBeenCalled()
    expect(latest!.messages).toHaveLength(2)
    expect(latest!.messages[0]?.role).toBe('user')
    expect(latest!.messages[1]?.role).toBe('assistant')
  })

  test('clearHistory resets messages and error', async () => {
    const chat = mock(async () => 'assistant reply')
    const assistant = { chat, isAvailable: () => true }
    let latest: UseClaudeChatResult | null = null

    await ctx.root.render(
      <ClaudeChatHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
        options={{ isAvailable: true, createAssistant: () => assistant }}
      />
    )

    await waitForEffects()
    await latest!.sendMessage('hello')
    await waitForEffects()

    latest!.clearHistory()
    await waitForEffects()

    expect(latest!.messages).toHaveLength(0)
    expect(latest!.error).toBeNull()
  })
})
