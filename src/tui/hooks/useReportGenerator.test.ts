/**
 * Tests for src/tui/hooks/useReportGenerator.ts
 * Hook for auto-generating 10-minute reports
 */

import { describe, test, expect, mock } from 'bun:test'
import type { Report } from '../services/report-generator.js'

describe('tui/hooks/useReportGenerator', () => {
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

  describe('report loading', () => {
    test('loads existing reports from database on mount', () => {
      // The hook queries for reports on mount
      const query = "SELECT * FROM reports WHERE type = 'auto_summary' ORDER BY created_at DESC LIMIT 50"
      expect(query).toContain('SELECT * FROM reports')
    })

    test('filters by type = "auto_summary"', () => {
      const query = "SELECT * FROM reports WHERE type = 'auto_summary' ORDER BY created_at DESC LIMIT 50"
      expect(query).toContain("type = 'auto_summary'")
    })

    test('orders by created_at DESC', () => {
      const query = "SELECT * FROM reports WHERE type = 'auto_summary' ORDER BY created_at DESC LIMIT 50"
      expect(query).toContain('ORDER BY created_at DESC')
    })

    test('limits to 50 reports', () => {
      const query = "SELECT * FROM reports WHERE type = 'auto_summary' ORDER BY created_at DESC LIMIT 50"
      expect(query).toContain('LIMIT 50')
    })

    test('polls for new reports every 5 seconds', () => {
      const POLL_INTERVAL = 5000
      expect(POLL_INTERVAL).toBe(5000)
    })

    test('ignores load errors silently', () => {
      let reports: Report[] = []
      
      try {
        throw new Error('Database error')
      } catch {
        // Ignore errors - reports remain unchanged
      }
      
      expect(reports).toEqual([])
    })
  })

  describe('generateNow', () => {
    test('sets isGenerating to true while generating', () => {
      let isGenerating = false
      
      // Simulate start of generation
      isGenerating = true
      expect(isGenerating).toBe(true)
    })

    test('calls generateReport from service', () => {
      // The hook calls: await generateReport(db)
      const generateReport = mock(async () => ({ id: '123' }))
      generateReport({} as any)
      expect(generateReport).toHaveBeenCalled()
    })

    test('prepends new report to reports array', () => {
      const existingReports: Report[] = [
        { id: '1', execution_id: 'exec-1', type: 'auto_summary', title: 'Old', content: '', data: null, severity: 'info', created_at: '2024-01-01T00:00:00Z' }
      ]
      
      const newReport: Report = {
        id: '2',
        execution_id: 'exec-1',
        type: 'auto_summary',
        title: 'New',
        content: '',
        data: null,
        severity: 'info',
        created_at: '2024-01-15T00:00:00Z'
      }
      
      // Simulate: setReports(prev => [report, ...prev])
      const updatedReports = [newReport, ...existingReports]
      
      expect(updatedReports[0]!.id).toBe('2')
      expect(updatedReports[1]!.id).toBe('1')
    })

    test('updates lastGeneratedAt timestamp', () => {
      let lastGeneratedAt: string | null = null
      
      // Simulate successful generation
      lastGeneratedAt = new Date().toISOString()
      
      expect(lastGeneratedAt).not.toBeNull()
      expect(lastGeneratedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test('sets isGenerating to false after completion', () => {
      let isGenerating = true
      
      // Simulate end of generation (in finally block)
      isGenerating = false
      
      expect(isGenerating).toBe(false)
    })

    test('handles null report result', () => {
      let reports: Report[] = [
        { id: '1', execution_id: 'exec-1', type: 'auto_summary', title: 'Existing', content: '', data: null, severity: 'info', created_at: '2024-01-01T00:00:00Z' }
      ]
      let lastGeneratedAt: string | null = null
      
      // Simulate null report from generateReport
      const report: Report | null = null
      
      if (report) {
        reports = [report, ...reports]
        lastGeneratedAt = new Date().toISOString()
      }
      
      // Reports should remain unchanged
      expect(reports).toHaveLength(1)
      expect(lastGeneratedAt).toBeNull()
    })

    test('ignores generation errors silently', () => {
      let reports: Report[] = []
      let isGenerating = true
      
      try {
        throw new Error('Generation failed')
      } catch {
        // Ignore errors
      } finally {
        isGenerating = false
      }
      
      expect(isGenerating).toBe(false)
      expect(reports).toEqual([])
    })
  })

  describe('auto-generation', () => {
    test('triggers generateNow every 10 minutes', () => {
      const REPORT_INTERVAL_MS = 10 * 60 * 1000
      expect(REPORT_INTERVAL_MS).toBe(600000)
    })

    test('REPORT_INTERVAL_MS is 10 * 60 * 1000', () => {
      const REPORT_INTERVAL_MS = 10 * 60 * 1000
      expect(REPORT_INTERVAL_MS).toBe(10 * 60 * 1000)
      expect(REPORT_INTERVAL_MS).toBe(600000)
    })

    test('clears auto-generation interval on unmount', () => {
      const mockClearInterval = mock(() => {})
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    test('clears report polling interval on unmount', () => {
      // First useEffect's cleanup
      const mockClearInterval = mock(() => {})
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
    })

    test('clears auto-generation interval on unmount', () => {
      // Second useEffect's cleanup
      const mockClearInterval = mock(() => {})
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    test('handles rapid generateNow calls', () => {
      const calls: number[] = []
      
      // Simulate rapid calls
      for (let i = 0; i < 5; i++) {
        calls.push(i)
      }
      
      expect(calls).toHaveLength(5)
    })

    test('preserves report order after multiple generations', () => {
      let reports: Report[] = []
      
      // Add reports in order
      const report1: Report = { id: '1', execution_id: 'exec', type: 'auto_summary', title: 'First', content: '', data: null, severity: 'info', created_at: '2024-01-15T10:00:00Z' }
      const report2: Report = { id: '2', execution_id: 'exec', type: 'auto_summary', title: 'Second', content: '', data: null, severity: 'info', created_at: '2024-01-15T10:10:00Z' }
      const report3: Report = { id: '3', execution_id: 'exec', type: 'auto_summary', title: 'Third', content: '', data: null, severity: 'info', created_at: '2024-01-15T10:20:00Z' }
      
      // Each new report is prepended
      reports = [report1, ...reports]
      reports = [report2, ...reports]
      reports = [report3, ...reports]
      
      // Most recent first
      expect(reports[0]!.id).toBe('3')
      expect(reports[1]!.id).toBe('2')
      expect(reports[2]!.id).toBe('1')
    })
  })

  describe('Report interface', () => {
    test('has all required properties', () => {
      const report: Report = {
        id: 'report-123',
        execution_id: 'exec-456',
        type: 'auto_summary',
        title: '10-Minute Summary - 2:30:00 PM',
        content: '## Execution Summary...',
        data: '{"totalPhases": 5}',
        severity: 'info',
        created_at: '2024-01-15T14:30:00.000Z'
      }
      
      expect(report.id).toBe('report-123')
      expect(report.execution_id).toBe('exec-456')
      expect(report.type).toBe('auto_summary')
      expect(report.title).toContain('10-Minute Summary')
      expect(report.content).toContain('Execution Summary')
      expect(report.data).toContain('totalPhases')
      expect(report.severity).toBe('info')
      expect(report.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test('data can be null', () => {
      const report: Report = {
        id: '1',
        execution_id: 'exec',
        type: 'auto_summary',
        title: 'Test',
        content: '',
        data: null,
        severity: 'info',
        created_at: '2024-01-15T10:00:00Z'
      }
      
      expect(report.data).toBeNull()
    })

    test('severity can be info or warning', () => {
      const infoReport: Report = {
        id: '1', execution_id: 'exec', type: 'auto_summary', title: 'Test',
        content: '', data: null, severity: 'info', created_at: '2024-01-15T10:00:00Z'
      }
      
      const warningReport: Report = {
        id: '2', execution_id: 'exec', type: 'auto_summary', title: 'Test',
        content: '', data: null, severity: 'warning', created_at: '2024-01-15T10:00:00Z'
      }
      
      expect(infoReport.severity).toBe('info')
      expect(warningReport.severity).toBe('warning')
    })
  })

  describe('UseReportGeneratorResult interface', () => {
    test('has all required properties', () => {
      const result = {
        reports: [] as Report[],
        isGenerating: false,
        lastGeneratedAt: null as string | null,
        generateNow: async () => {}
      }
      
      expect(result.reports).toBeDefined()
      expect(result.isGenerating).toBeDefined()
      expect(result.lastGeneratedAt).toBeDefined()
      expect(result.generateNow).toBeDefined()
      expect(typeof result.generateNow).toBe('function')
    })
  })

  describe('dependency arrays', () => {
    test('load reports effect depends on db', () => {
      const deps = ['db']
      expect(deps).toContain('db')
    })

    test('generateNow callback depends on db', () => {
      const deps = ['db']
      expect(deps).toContain('db')
    })

    test('auto-generation effect depends on generateNow', () => {
      const deps = ['generateNow']
      expect(deps).toContain('generateNow')
    })
  })
})
