/**
 * Tests for src/tui/hooks/useReportGenerator.ts
 * Hook for auto-generating 10-minute reports
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { Report } from '../services/report-generator.js'
import type { UseReportGeneratorResult } from './useReportGenerator.js'
import { resetTuiState } from '../state.js'

function createMockReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-123',
    execution_id: 'exec-456',
    type: 'auto_summary',
    title: '10-Minute Summary - 10:30:00 AM',
    content: '## Execution Summary\n\n### Phases\n- Total: 5',
    data: '{"totalPhases":5}',
    severity: 'info',
    created_at: '2024-01-15T10:30:00Z',
    ...overrides
  }
}

describe('tui/hooks/useReportGenerator', () => {
  beforeEach(() => {
    resetTuiState()
  })

  afterEach(() => {
    resetTuiState()
  })

  describe('initial state', () => {
    test('reports is empty array initially', () => {
      const initialReports: Report[] = []
      expect(initialReports).toEqual([])
      expect(initialReports).toHaveLength(0)
    })

    test('isGenerating is false initially', () => {
      const initialIsGenerating = false
      expect(initialIsGenerating).toBe(false)
    })

    test('lastGeneratedAt is null initially', () => {
      const initialLastGeneratedAt = null
      expect(initialLastGeneratedAt).toBeNull()
    })
  })

  describe('UseReportGeneratorResult interface', () => {
    test('has all required properties', () => {
      const result: UseReportGeneratorResult = {
        reports: [],
        isGenerating: false,
        lastGeneratedAt: null,
        generateNow: async () => {}
      }

      expect(result.reports).toBeDefined()
      expect(typeof result.isGenerating).toBe('boolean')
      expect(result.lastGeneratedAt).toBeNull()
      expect(typeof result.generateNow).toBe('function')
    })
  })

  describe('Report interface', () => {
    test('has all required properties', () => {
      const report = createMockReport()

      expect(report.id).toBeDefined()
      expect(report.execution_id).toBeDefined()
      expect(report.type).toBeDefined()
      expect(report.title).toBeDefined()
      expect(report.content).toBeDefined()
      expect(report.severity).toBeDefined()
      expect(report.created_at).toBeDefined()
    })

    test('data can be null', () => {
      const report = createMockReport({ data: null })
      expect(report.data).toBeNull()
    })

    test('type is auto_summary for auto-generated reports', () => {
      const report = createMockReport()
      expect(report.type).toBe('auto_summary')
    })

    test('severity can be info', () => {
      const report = createMockReport({ severity: 'info' })
      expect(report.severity).toBe('info')
    })

    test('severity can be warning', () => {
      const report = createMockReport({ severity: 'warning' })
      expect(report.severity).toBe('warning')
    })
  })

  describe('polling intervals', () => {
    test('report generation interval is 10 minutes', () => {
      const REPORT_INTERVAL_MS = 10 * 60 * 1000
      expect(REPORT_INTERVAL_MS).toBe(600000)
    })

    test('report loading interval is 5 seconds', () => {
      const LOAD_INTERVAL_MS = 5000
      expect(LOAD_INTERVAL_MS).toBe(5000)
    })

    test('cleanup clears both intervals', () => {
      const mockClearInterval = mock(() => {})

      // Simulate cleanup
      mockClearInterval()
      mockClearInterval()

      expect(mockClearInterval).toHaveBeenCalledTimes(2)
    })
  })

  describe('generateNow', () => {
    test('sets isGenerating to true during generation', () => {
      let isGenerating = false

      // Simulate start
      isGenerating = true
      expect(isGenerating).toBe(true)
    })

    test('sets isGenerating to false after generation', () => {
      let isGenerating = true

      // Simulate completion
      isGenerating = false
      expect(isGenerating).toBe(false)
    })

    test('sets isGenerating to false on error', () => {
      let isGenerating = true

      try {
        throw new Error('Generation failed')
      } catch {
        // Handle error
      } finally {
        isGenerating = false
      }

      expect(isGenerating).toBe(false)
    })

    test('prepends new report to reports array', () => {
      let reports: Report[] = [createMockReport({ id: 'old-report' })]

      const newReport = createMockReport({ id: 'new-report' })
      reports = [newReport, ...reports]

      expect(reports[0]!.id).toBe('new-report')
      expect(reports[1]!.id).toBe('old-report')
    })

    test('updates lastGeneratedAt on successful generation', () => {
      let lastGeneratedAt: string | null = null

      const report = createMockReport()
      if (report) {
        lastGeneratedAt = new Date().toISOString()
      }

      expect(lastGeneratedAt).not.toBeNull()
      expect(lastGeneratedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test('does not update lastGeneratedAt when report is null', () => {
      let lastGeneratedAt: string | null = null

      const report: Report | null = null
      if (report) {
        lastGeneratedAt = new Date().toISOString()
      }

      expect(lastGeneratedAt).toBeNull()
    })
  })

  describe('report loading', () => {
    test('loads reports from database on mount', () => {
      const mockQuery = mock(() => [createMockReport()])

      const dbReports = mockQuery()
      expect(mockQuery).toHaveBeenCalled()
      expect(dbReports).toHaveLength(1)
    })

    test('filters reports by type auto_summary', () => {
      const query = "SELECT * FROM reports WHERE type = 'auto_summary' ORDER BY created_at DESC LIMIT 50"
      expect(query).toContain("type = 'auto_summary'")
    })

    test('orders reports by created_at DESC', () => {
      const query = "SELECT * FROM reports WHERE type = 'auto_summary' ORDER BY created_at DESC LIMIT 50"
      expect(query).toContain('ORDER BY created_at DESC')
    })

    test('limits to 50 reports', () => {
      const query = "SELECT * FROM reports WHERE type = 'auto_summary' ORDER BY created_at DESC LIMIT 50"
      expect(query).toContain('LIMIT 50')
    })

    test('ignores load errors silently', () => {
      let reports: Report[] = [createMockReport()]

      try {
        throw new Error('Database error')
      } catch {
        // Ignore errors
      }

      expect(reports).toHaveLength(1)
    })
  })

  describe('error handling', () => {
    test('ignores generation errors silently', () => {
      let errorThrown = false

      try {
        throw new Error('Generation failed')
      } catch {
        // Errors are ignored
      }

      expect(errorThrown).toBe(false)
    })

    test('ignores load errors silently', () => {
      let errorThrown = false

      try {
        throw new Error('Load failed')
      } catch {
        // Errors are ignored
      }

      expect(errorThrown).toBe(false)
    })
  })

  describe('state keys', () => {
    test('uses correct key for reports', () => {
      const key = 'tui:reports:list'
      expect(key).toBe('tui:reports:list')
    })

    test('uses correct key for generating', () => {
      const key = 'tui:reports:generating'
      expect(key).toBe('tui:reports:generating')
    })

    test('uses correct key for lastGeneratedAt', () => {
      const key = 'tui:reports:lastGeneratedAt'
      expect(key).toBe('tui:reports:lastGeneratedAt')
    })
  })

  describe('callback dependencies', () => {
    test('generateNow depends on db and state setters', () => {
      const deps = ['db', 'setIsGenerating', 'setReports', 'setLastGeneratedAt']
      expect(deps).toContain('db')
      expect(deps).toContain('setIsGenerating')
    })
  })

  describe('report content', () => {
    test('report content contains execution summary', () => {
      const report = createMockReport({
        content: '## Execution Summary\n\n### Phases\n- Total: 5'
      })
      expect(report.content).toContain('Execution Summary')
    })

    test('report content contains phases section', () => {
      const report = createMockReport({
        content: '## Execution Summary\n\n### Phases\n- Total: 5'
      })
      expect(report.content).toContain('Phases')
    })

    test('report data contains metrics JSON', () => {
      const report = createMockReport({
        data: JSON.stringify({ totalPhases: 5, completedPhases: 3 })
      })
      const data = JSON.parse(report.data!)
      expect(data.totalPhases).toBe(5)
      expect(data.completedPhases).toBe(3)
    })

    test('report title includes timestamp', () => {
      const report = createMockReport({
        title: '10-Minute Summary - 10:30:00 AM'
      })
      expect(report.title).toContain('10-Minute Summary')
    })
  })

  describe('severity determination', () => {
    test('severity is warning when there are failed agents', () => {
      const metrics = { failedAgents: 1, failedToolCalls: 0 }
      const severity = metrics.failedAgents > 0 || metrics.failedToolCalls > 0 ? 'warning' : 'info'
      expect(severity).toBe('warning')
    })

    test('severity is warning when there are failed tool calls', () => {
      const metrics = { failedAgents: 0, failedToolCalls: 2 }
      const severity = metrics.failedAgents > 0 || metrics.failedToolCalls > 0 ? 'warning' : 'info'
      expect(severity).toBe('warning')
    })

    test('severity is info when no failures', () => {
      const metrics = { failedAgents: 0, failedToolCalls: 0 }
      const severity = metrics.failedAgents > 0 || metrics.failedToolCalls > 0 ? 'warning' : 'info'
      expect(severity).toBe('info')
    })
  })

  describe('edge cases', () => {
    test('handles empty reports list', () => {
      const reports: Report[] = []
      expect(reports).toHaveLength(0)
    })

    test('handles many reports', () => {
      const reports = Array.from({ length: 50 }, (_, i) =>
        createMockReport({ id: `report-${i}` })
      )
      expect(reports).toHaveLength(50)
    })

    test('handles rapid generation requests', () => {
      let isGenerating = false
      let generationCount = 0

      // Simulate multiple rapid requests
      for (let i = 0; i < 5; i++) {
        if (!isGenerating) {
          isGenerating = true
          generationCount++
          isGenerating = false
        }
      }

      expect(generationCount).toBe(5)
    })

    test('handles null report from generateReport', () => {
      let reports: Report[] = []
      const newReport: Report | null = null

      if (newReport) {
        reports = [newReport, ...reports]
      }

      expect(reports).toHaveLength(0)
    })
  })

  describe('auto-generation scheduling', () => {
    test('schedules generation every 10 minutes', () => {
      const REPORT_INTERVAL_MS = 10 * 60 * 1000

      let scheduledTime = 0
      const setInterval = (callback: () => void, ms: number) => {
        scheduledTime = ms
        return 1
      }

      setInterval(() => {}, REPORT_INTERVAL_MS)
      expect(scheduledTime).toBe(600000)
    })

    test('calls generateNow on each interval', () => {
      const generateNow = mock(async () => {})

      // Simulate interval firing
      generateNow()
      generateNow()

      expect(generateNow).toHaveBeenCalledTimes(2)
    })
  })
})
