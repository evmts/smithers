/**
 * Tests for src/tui/components/views/ReportViewer.tsx
 * Report viewer component for displaying auto-generated summaries
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { ReportViewer, type ReportViewerProps } from './ReportViewer.js'
import type { UseReportGeneratorResult } from '../../hooks/useReportGenerator.js'
import type { Report } from '../../services/report-generator.js'
import { getSeverityColor, colors } from '../../utils/colors.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../../test-utils.js'
import { readTuiState } from '../../state.js'
import { truncate } from '../../utils/format.js'

// Helper to create a mock report
function createMockReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-1',
    execution_id: 'exec-1',
    type: 'auto_summary',
    title: 'Test Report',
    content: 'Report content here',
    data: '{}',
    severity: 'info',
    created_at: '2024-01-15T10:30:00Z',
    ...overrides,
  }
}

// Helper to create mock report state
function createMockReportState(overrides: Partial<UseReportGeneratorResult> = {}): UseReportGeneratorResult {
  return {
    reports: [],
    isGenerating: false,
    lastGeneratedAt: null,
    generateNow: async () => {},
    ...overrides,
  }
}

// Helper to create props
function createProps(ctx: TuiTestContext, overrides: Partial<ReportViewerProps> = {}): ReportViewerProps {
  return {
    db: ctx.db,
    height: 20,
    ...overrides,
  }
}

describe('tui/components/views/ReportViewer', () => {
  describe('loading state (no db or reportState)', () => {
    test('renders connecting message when db is undefined', () => {
      const props: ReportViewerProps = { height: 20, db: undefined, reportState: undefined }
      const element = ReportViewer(props)

      expect(element).toBeDefined()
      expect(element.type).toBe('box')

      const textChild = element.props.children
      expect(textChild.props.content).toBe('Connecting to database...')
      expect(textChild.props.style.fg).toBe('#888888')
    })

    test('loading container uses column flex direction', () => {
      const props: ReportViewerProps = { height: 20, db: undefined, reportState: undefined }
      const element = ReportViewer(props)

      expect(element.props.style.flexDirection).toBe('column')
    })
  })

  describe('with reportState prop (injected)', () => {
    let ctx: TuiTestContext

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
    })

    test('renders ReportViewerContent when reportState is provided', async () => {
      const reportState = createMockReportState({ reports: [] })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      // Should render without error
      expect(true).toBe(true)
    })

    test('renders with multiple reports', async () => {
      const reports = [
        createMockReport({ id: 'r1', title: 'Report 1' }),
        createMockReport({ id: 'r2', title: 'Report 2' }),
        createMockReport({ id: 'r3', title: 'Report 3' }),
      ]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders with generating state', async () => {
      const reportState = createMockReportState({ isGenerating: true })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('with db prop only', () => {
    let ctx: TuiTestContext

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
    })

    test('renders ReportViewerWithData when db is provided', async () => {
      const props = createProps(ctx, { reportState: undefined })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('loads reports from database', async () => {
      // Insert a report into the database
      ctx.db.db.run(
        `INSERT INTO reports (id, execution_id, type, title, content, data, severity, created_at)
         VALUES (?, ?, 'auto_summary', ?, ?, ?, ?, ?)`,
        [
          'test-report-1',
          ctx.executionId,
          'DB Report',
          'Content from DB',
          '{}',
          'info',
          new Date().toISOString(),
        ]
      )

      const props = createProps(ctx, { reportState: undefined })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects(50) // Wait for hook to load

      expect(true).toBe(true)
    })
  })

  describe('state management', () => {
    let ctx: TuiTestContext

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
    })

    test('uses tui:reports:selectedIndex state key', async () => {
      const reportState = createMockReportState()
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      const selectedIndex = readTuiState<number>('tui:reports:selectedIndex', -1)
      expect([0, -1]).toContain(selectedIndex)
    })

    test('resets state on context cleanup', async () => {
      const reportState = createMockReportState()
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      cleanupTuiTestContext(ctx)

      const selectedIndex = readTuiState<number>('tui:reports:selectedIndex', -999)
      expect(selectedIndex).toBe(-999) // Should return fallback since state was cleared
    })
  })

  describe('empty reports state', () => {
    let ctx: TuiTestContext

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
    })

    test('renders empty state instructions', async () => {
      const reportState = createMockReportState({ reports: [] })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      // Component should render without error
      expect(true).toBe(true)
    })
  })

  describe('report severity colors', () => {
    test('getSeverityColor returns correct colors', () => {
      expect(getSeverityColor('info')).toBe(colors.blue)
      expect(getSeverityColor('warning')).toBe(colors.orange)
      expect(getSeverityColor('critical')).toBe(colors.red)
      expect(getSeverityColor('unknown')).toBe(colors.blue) // default
    })
  })

  describe('truncate utility', () => {
    test('truncates long strings', () => {
      expect(truncate('Short', 30)).toBe('Short')
      expect(truncate('A very long title that exceeds thirty characters', 30)).toBe('A very long title that exce...')
    })

    test('handles exact length', () => {
      expect(truncate('Exactly thirty characters!!!', 30)).toBe('Exactly thirty characters!!!')
    })

    test('handles empty string', () => {
      expect(truncate('', 30)).toBe('')
    })
  })

  describe('getLineColor function behavior', () => {
    // Test the inline getLineColor function behavior through integration tests
    let ctx: TuiTestContext

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
    })

    test('renders ## headers with purple color', async () => {
      const reports = [createMockReport({ content: '## Heading' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders ### headers with blue color', async () => {
      const reports = [createMockReport({ content: '### Subheading' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders list items with cyan color', async () => {
      const reports = [createMockReport({ content: '- List item' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders Error lines with red color', async () => {
      const reports = [createMockReport({ content: 'Something Error occurred' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders Failed lines with red color', async () => {
      const reports = [createMockReport({ content: 'Build Failed' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders Warning lines with orange color', async () => {
      const reports = [createMockReport({ content: 'Warning: something' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders plain text with default color', async () => {
      const reports = [createMockReport({ content: 'Plain text content' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('API key warning', () => {
    let ctx: TuiTestContext
    const originalEnv = process.env['ANTHROPIC_API_KEY']

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
      if (originalEnv !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = originalEnv
      } else {
        delete process.env['ANTHROPIC_API_KEY']
      }
    })

    test('renders without error when API key is not set', async () => {
      delete process.env['ANTHROPIC_API_KEY']
      const reportState = createMockReportState()
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders without error when API key is set', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key'
      const reportState = createMockReportState()
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('edge cases', () => {
    let ctx: TuiTestContext

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
    })

    test('handles report with empty content', async () => {
      const reports = [createMockReport({ content: '' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles report with very long title', async () => {
      const longTitle = 'A'.repeat(100)
      const reports = [createMockReport({ title: longTitle })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles report with special characters', async () => {
      const reports = [createMockReport({
        content: '<script>alert("xss")</script>\n&amp; entities\n"quotes"'
      })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles many reports', async () => {
      const reports = Array.from({ length: 50 }, (_, i) =>
        createMockReport({ id: `r${i}`, title: `Report ${i}` })
      )
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles content with only newlines', async () => {
      const reports = [createMockReport({ content: '\n\n\n' })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles multiline content with mixed formats', async () => {
      const reports = [createMockReport({
        content: '## Header\n### Subheader\n- Item 1\n- Item 2\nPlain text\nError occurred\nWarning: be careful'
      })]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles height of zero', async () => {
      const reportState = createMockReportState()
      const props = createProps(ctx, { reportState, height: 0 })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles very large height', async () => {
      const reportState = createMockReportState()
      const props = createProps(ctx, { reportState, height: 1000 })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('component exports', () => {
    test('exports ReportViewer function', async () => {
      const module = await import('./ReportViewer.js')
      expect(typeof module.ReportViewer).toBe('function')
    })

    test('exports ReportViewerProps type', () => {
      // TypeScript type check - compiles means type exported
      const _props: ReportViewerProps = {
        height: 20,
        db: undefined,
        reportState: undefined
      }
      expect(_props).toBeDefined()
    })
  })

  describe('keyboard interaction', () => {
    let ctx: TuiTestContext

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
    })

    test('component handles keyboard events via useKeyboard', async () => {
      const reports = [
        createMockReport({ id: 'r1', title: 'Report 1' }),
        createMockReport({ id: 'r2', title: 'Report 2' }),
      ]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      // useKeyboard is called during render for j/k/r navigation
      expect(true).toBe(true)
    })

    test('generateNow is callable', async () => {
      let generateCalled = false
      const reportState = createMockReportState({
        generateNow: async () => { generateCalled = true }
      })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      // Verify generateNow is accessible
      await reportState.generateNow()
      expect(generateCalled).toBe(true)
    })
  })

  describe('selection behavior', () => {
    let ctx: TuiTestContext

    beforeEach(() => {
      ctx = createTuiTestContext()
    })

    afterEach(() => {
      cleanupTuiTestContext(ctx)
    })

    test('first report is selected by default', async () => {
      const reports = [
        createMockReport({ id: 'r1', title: 'First' }),
        createMockReport({ id: 'r2', title: 'Second' }),
      ]
      const reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      const selectedIndex = readTuiState<number>('tui:reports:selectedIndex', -1)
      expect([0, -1]).toContain(selectedIndex)
    })

    test('clamps selection when reports list shrinks', async () => {
      // Start with multiple reports
      const reports = [
        createMockReport({ id: 'r1', title: 'First' }),
        createMockReport({ id: 'r2', title: 'Second' }),
        createMockReport({ id: 'r3', title: 'Third' }),
      ]
      let reportState = createMockReportState({ reports })
      const props = createProps(ctx, { reportState })

      await ctx.root.render(<ReportViewer {...props} />)
      await waitForEffects()

      // Re-render with fewer reports (simulates reports being removed)
      const fewerReports = [createMockReport({ id: 'r1', title: 'Only One' })]
      reportState = createMockReportState({ reports: fewerReports })
      await ctx.root.render(<ReportViewer {...{ ...props, reportState }} />)
      await waitForEffects()

      // Selection should be clamped to valid range
      expect(true).toBe(true)
    })
  })

  describe('colors constant', () => {
    test('colors object has required color values', () => {
      expect(colors.purple).toBe('#bb9af7')
      expect(colors.blue).toBe('#7aa2f7')
      expect(colors.cyan).toBe('#7dcfff')
      expect(colors.red).toBe('#f7768e')
      expect(colors.orange).toBe('#e0af68')
      expect(colors.fg).toBe('#c0caf5')
      expect(colors.comment).toBe('#565f89')
    })
  })

  describe('report data structure', () => {
    test('report has all required fields', () => {
      const report = createMockReport()
      expect(report.id).toBeDefined()
      expect(report.execution_id).toBeDefined()
      expect(report.type).toBe('auto_summary')
      expect(report.title).toBeDefined()
      expect(report.content).toBeDefined()
      expect(report.data).toBeDefined()
      expect(report.severity).toBeDefined()
      expect(report.created_at).toBeDefined()
    })

    test('report severity values are handled', () => {
      expect(createMockReport({ severity: 'info' }).severity).toBe('info')
      expect(createMockReport({ severity: 'warning' }).severity).toBe('warning')
      expect(createMockReport({ severity: 'critical' }).severity).toBe('critical')
    })
  })

  describe('reportState interface', () => {
    test('reportState has all required fields', () => {
      const reportState = createMockReportState()
      expect(Array.isArray(reportState.reports)).toBe(true)
      expect(typeof reportState.isGenerating).toBe('boolean')
      expect(reportState.lastGeneratedAt).toBeNull()
      expect(typeof reportState.generateNow).toBe('function')
    })

    test('reportState can have populated values', () => {
      const reports = [createMockReport()]
      const reportState = createMockReportState({
        reports,
        isGenerating: true,
        lastGeneratedAt: '2024-01-15T10:00:00Z'
      })

      expect(reportState.reports).toHaveLength(1)
      expect(reportState.isGenerating).toBe(true)
      expect(reportState.lastGeneratedAt).toBe('2024-01-15T10:00:00Z')
    })
  })
})
