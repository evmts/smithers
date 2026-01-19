import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import type { SmithersDB } from '../../db/index.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../test-utils.js'
import { useReportGenerator, type UseReportGeneratorResult } from './useReportGenerator.js'

function ReportGeneratorHarness({
  db,
  onResult,
}: {
  db: SmithersDB
  onResult: (result: UseReportGeneratorResult) => void
}) {
  const result = useReportGenerator(db)
  onResult(result)
  return <test-hook />
}

describe('useReportGenerator', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('loads existing auto_summary reports', async () => {
    ctx.db.db.run(
      `INSERT INTO reports (id, execution_id, type, title, content, data, severity, created_at)
       VALUES (?, ?, 'auto_summary', ?, ?, ?, ?, ?)`
      ,
      [
        'report-1',
        ctx.executionId,
        'Existing Report',
        'Content',
        '{}',
        'info',
        new Date().toISOString(),
      ]
    )

    let latest: UseReportGeneratorResult | null = null

    await ctx.root.render(
      <ReportGeneratorHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
      />
    )

    await waitForEffects()

    expect(latest!.reports).toHaveLength(1)
    expect(latest!.reports[0]?.title).toBe('Existing Report')
  })

  test('generateNow appends new report and updates timestamps', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    let latest: UseReportGeneratorResult | null = null

    await ctx.root.render(
      <ReportGeneratorHarness
        db={ctx.db}
        onResult={(result) => { latest = result }}
      />
    )

    await waitForEffects()
    await latest!.generateNow()
    await waitForEffects()

    expect(latest!.reports.length).toBeGreaterThan(0)
    expect(latest!.lastGeneratedAt).not.toBeNull()
    expect(latest!.isGenerating).toBe(false)
  })
})
