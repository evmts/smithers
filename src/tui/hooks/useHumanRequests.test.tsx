import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import type { SmithersDB } from '../../db/index.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../test-utils.js'
import { useHumanRequests, type UseHumanRequestsResult } from './useHumanRequests.js'

function HumanRequestsHarness({ db, onResult }: { db: SmithersDB; onResult: (result: UseHumanRequestsResult) => void }) {
  const result = useHumanRequests(db)
  onResult(result)
  return <test-hook />
}

describe('useHumanRequests', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('loads pending requests and selects first by default', async () => {
    ctx.db.human.request('confirmation', 'Confirm?')
    ctx.db.human.request('input', 'Enter value')

    let latest: UseHumanRequestsResult | null = null

    await ctx.root.render(
      <HumanRequestsHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
      />
    )

    await waitForEffects()

    expect(latest!.pendingRequests).toHaveLength(2)
    expect(latest!.selectedIndex).toBe(0)
    expect(latest!.selectedRequest?.prompt).toBe('Confirm?')
  })

  test('selectRequest clamps index', async () => {
    ctx.db.human.request('confirmation', 'Confirm?')
    let latest: UseHumanRequestsResult | null = null

    await ctx.root.render(
      <HumanRequestsHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
      />
    )

    await waitForEffects()
    latest!.selectRequest(10)
    await waitForEffects()

    expect(latest!.selectedIndex).toBe(0)
  })

  test('approveRequest resolves and refreshes', async () => {
    const requestId = ctx.db.human.request('confirmation', 'Confirm?')
    let latest: UseHumanRequestsResult | null = null

    await ctx.root.render(
      <HumanRequestsHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
      />
    )

    await waitForEffects()
    latest!.approveRequest({ ok: true })
    await waitForEffects()

    const updated = ctx.db.human.get(requestId)
    expect(updated?.status).toBe('approved')
    expect(latest!.pendingRequests).toHaveLength(0)
  })
})
