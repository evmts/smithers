import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import type { SmithersDB } from '../../db/index.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../test-utils.js'
import { useRenderFrames, type UseRenderFramesResult } from './useRenderFrames.js'

function RenderFramesHarness({
  db,
  onResult,
}: {
  db: SmithersDB
  onResult: (result: UseRenderFramesResult) => void
}) {
  const result = useRenderFrames(db)
  onResult(result)
  return <test-hook />
}

describe('useRenderFrames', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('loads frames and exposes navigation helpers', async () => {
    ctx.db.renderFrames.store('<frame-1 />', 1)
    ctx.db.renderFrames.store('<frame-2 />', 2)
    ctx.db.renderFrames.store('<frame-3 />', 3)

    let latest: UseRenderFramesResult | null = null

    await ctx.root.render(
      <RenderFramesHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
      />
    )

    await waitForEffects()

    expect(latest!.totalFrames).toBe(3)
    expect(latest!.currentIndex).toBe(0)
    expect(latest!.currentFrame?.tree_xml).toBe('<frame-1 />')

    latest!.goToLatest()
    await waitForEffects()

    expect(latest!.currentIndex).toBe(2)
    expect(latest!.currentFrame?.tree_xml).toBe('<frame-3 />')

    latest!.goToFrame(-5)
    await waitForEffects()

    expect(latest!.currentIndex).toBe(0)
  })
})
