import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import type { SmithersDB } from '../../db/index.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../test-utils.js'
import { usePollEvents, type TimelineEvent } from './usePollEvents.js'

function PollEventsHarness({ db, onResult }: { db: SmithersDB; onResult: (events: TimelineEvent[]) => void }) {
  const events = usePollEvents(db)
  onResult(events)
  return <test-hook />
}

describe('usePollEvents', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('returns empty events when no current execution', async () => {
    ctx.db.execution.complete(ctx.executionId)
    let latest: TimelineEvent[] | null = null

    await ctx.root.render(
      <PollEventsHarness
        db={ctx.db}
        onResult={(events) => { latest = events }}
      />
    )

    await waitForEffects()
    expect(latest).toEqual([])
  })

  test('maps phases, agents, and tools into timeline events', async () => {
    const phaseId = ctx.db.phases.start('Build')
    const agentId = ctx.db.agents.start('prompt', 'claude-3')
    const toolId = ctx.db.tools.start(agentId, 'Read', { path: '/tmp' })

    ctx.db.db.run('UPDATE phases SET created_at = ? WHERE id = ?', ['2024-01-01T00:00:01.000Z', phaseId])
    ctx.db.db.run('UPDATE agents SET created_at = ?, tokens_input = ?, tokens_output = ? WHERE id = ?', [
      '2024-01-01T00:00:02.000Z',
      10,
      5,
      agentId,
    ])
    ctx.db.db.run('UPDATE tool_calls SET created_at = ?, duration_ms = ? WHERE id = ?', [
      '2024-01-01T00:00:03.000Z',
      42,
      toolId,
    ])

    let latest: TimelineEvent[] | null = null

    await ctx.root.render(
      <PollEventsHarness
        db={ctx.db}
        onResult={(events) => { latest = events }}
      />
    )

    await waitForEffects()

    expect(latest).toHaveLength(3)
    expect(latest![0]?.type).toBe('tool')
    expect(latest![0]?.details).toBe('42ms')
    expect(latest![1]?.type).toBe('agent')
    expect(latest![1]?.details).toBe('10/5 tokens')
    expect(latest![2]?.type).toBe('phase')
  })
})
