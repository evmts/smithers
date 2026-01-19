import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import type { SmithersDB } from '../../db/index.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../test-utils.js'
import { usePollTableData, type TableData } from './usePollTableData.js'

function PollTableDataHarness({
  db,
  tableName,
  onResult,
}: {
  db: SmithersDB
  tableName: string
  onResult: (data: TableData) => void
}) {
  const data = usePollTableData(db, tableName)
  onResult(data)
  return <test-hook />
}

describe('usePollTableData', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('loads columns and rows for allowed tables', async () => {
    let latest: TableData | null = null

    await ctx.root.render(
      <PollTableDataHarness
        db={ctx.db}
        tableName="executions"
        onResult={(data) => { latest = data }}
      />
    )

    await waitForEffects()

    expect(latest!.columns).toContain('id')
    expect(latest!.data.length).toBeGreaterThan(0)
  })

  test('returns empty data for disallowed tables', async () => {
    let latest: TableData | null = null

    await ctx.root.render(
      <PollTableDataHarness
        db={ctx.db}
        tableName="executions; DROP TABLE executions;"
        onResult={(data) => { latest = data }}
      />
    )

    await waitForEffects()

    expect(latest!.columns).toHaveLength(0)
    expect(latest!.data).toHaveLength(0)
  })
})
