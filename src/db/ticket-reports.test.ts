import { describe, test, expect, beforeEach } from 'bun:test'
import { createSmithersDB, type SmithersDB } from './index.js'

describe('TicketReportsModule', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('Test Execution', 'test.tsx')
  })

  describe('add', () => {
    test('creates report with all fields', () => {
      const reportId = db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'select-ticket',
        runId: '2026-01-26T10:00:00Z',
        reportType: 'state',
        title: 'Ticket Selected',
        content: 'Selected T-001 for processing',
        data: { smallestStepGoal: 'Add endpoint', budget: { maxFilesChanged: 5 } },
      })

      expect(reportId).toBeTruthy()
      const report = db.ticketReports.get(reportId)
      expect(report).not.toBeNull()
      expect(report?.ticketId).toBe('T-001')
      expect(report?.reportType).toBe('state')
      expect(report?.triaged).toBe(false)
      expect(report?.data?.smallestStepGoal).toBe('Add endpoint')
    })

    test('creates report without optional data', () => {
      const reportId = db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'execute',
        runId: '2026-01-26T10:00:00Z',
        reportType: 'execution',
        title: 'Execution Complete',
        content: 'Implemented feature',
      })

      const report = db.ticketReports.get(reportId)
      expect(report?.data).toBeUndefined()
    })
  })

  describe('get', () => {
    test('returns report by id', () => {
      const reportId = db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'test',
        runId: 'run1',
        reportType: 'ci',
        title: 'CI Test',
        content: 'Tests passed',
      })

      const report = db.ticketReports.get(reportId)
      expect(report?.title).toBe('CI Test')
    })

    test('returns null for non-existent report', () => {
      const report = db.ticketReports.get('non-existent-id')
      expect(report).toBeNull()
    })
  })

  describe('getByRunId', () => {
    test('returns all reports for a run', () => {
      const runId = '2026-01-26T10:00:00Z'

      db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'select',
        runId,
        reportType: 'state',
        title: 'Selected',
        content: 'Content 1',
      })

      db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'execute',
        runId,
        reportType: 'execution',
        title: 'Executed',
        content: 'Content 2',
      })

      db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'other',
        runId: 'different-run',
        reportType: 'ci',
        title: 'Other',
        content: 'Content 3',
      })

      const reports = db.ticketReports.getByRunId(runId)
      expect(reports.length).toBe(2)
    })
  })

  describe('getByTicketId', () => {
    test('returns all reports for a ticket', () => {
      db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'step1',
        runId: 'run1',
        reportType: 'state',
        title: 'Report 1',
        content: 'Content',
      })

      db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'step2',
        runId: 'run2',
        reportType: 'execution',
        title: 'Report 2',
        content: 'Content',
      })

      db.ticketReports.add({
        executionId,
        ticketId: 'T-002',
        stepName: 'step1',
        runId: 'run1',
        reportType: 'state',
        title: 'Other',
        content: 'Content',
      })

      const reports = db.ticketReports.getByTicketId('T-001')
      expect(reports.length).toBe(2)
    })
  })

  describe('getUntriaged', () => {
    test('returns only untriaged reports', () => {
      const id1 = db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'review',
        runId: 'run1',
        reportType: 'review',
        title: 'Review 1',
        content: 'Found issues',
      })

      db.ticketReports.add({
        executionId,
        ticketId: 'T-002',
        stepName: 'review',
        runId: 'run1',
        reportType: 'review',
        title: 'Review 2',
        content: 'More issues',
      })

      // Mark one as triaged
      db.ticketReports.markTriaged(id1, 'internal_ticket', 'TRIAGE-001')

      const untriaged = db.ticketReports.getUntriaged()
      expect(untriaged.length).toBe(1)
      expect(untriaged[0].title).toBe('Review 2')
    })
  })

  describe('markTriaged', () => {
    test('marks report as triaged with action and result', () => {
      const reportId = db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'review',
        runId: 'run1',
        reportType: 'review',
        title: 'Review',
        content: 'Issues found',
      })

      db.ticketReports.markTriaged(reportId, 'github_issue', 'GH-123')

      const report = db.ticketReports.get(reportId)
      expect(report?.triaged).toBe(true)
      expect(report?.triageAction).toBe('github_issue')
      expect(report?.triageResultId).toBe('GH-123')
    })

    test('marks as triaged with no action', () => {
      const reportId = db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'ci',
        runId: 'run1',
        reportType: 'ci',
        title: 'CI Pass',
        content: 'All good',
      })

      db.ticketReports.markTriaged(reportId, 'none')

      const report = db.ticketReports.get(reportId)
      expect(report?.triaged).toBe(true)
      expect(report?.triageAction).toBe('none')
      expect(report?.triageResultId).toBeUndefined()
    })
  })

  describe('listByType', () => {
    test('returns reports filtered by type', () => {
      db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'review1',
        runId: 'run1',
        reportType: 'review',
        title: 'Code Review',
        content: 'Review content',
      })

      db.ticketReports.add({
        executionId,
        ticketId: 'T-001',
        stepName: 'ci',
        runId: 'run1',
        reportType: 'ci',
        title: 'CI Report',
        content: 'CI content',
      })

      db.ticketReports.add({
        executionId,
        ticketId: 'T-002',
        stepName: 'review2',
        runId: 'run1',
        reportType: 'review',
        title: 'Test Review',
        content: 'Review content',
      })

      const reviews = db.ticketReports.listByType('review')
      expect(reviews.length).toBe(2)

      const ci = db.ticketReports.listByType('ci')
      expect(ci.length).toBe(1)
    })

    test('respects limit', () => {
      for (let i = 0; i < 10; i++) {
        db.ticketReports.add({
          executionId,
          ticketId: 'T-001',
          stepName: `review${i}`,
          runId: `run${i}`,
          reportType: 'review',
          title: `Review ${i}`,
          content: 'Content',
        })
      }

      const limited = db.ticketReports.listByType('review', 5)
      expect(limited.length).toBe(5)
    })
  })
})
