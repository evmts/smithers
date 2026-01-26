import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, parseJson } from './utils.js'

export type ReportType = 'state' | 'execution' | 'ci' | 'review' | 'triage' | 'integration' | 'address'

export type TriageAction = 'none' | 'internal_ticket' | 'github_issue'

export type TicketReport = {
  id: string
  executionId: string
  ticketId: string
  stepName: string
  runId: string
  reportType: ReportType
  title: string
  content: string
  data?: Record<string, unknown>
  triaged: boolean
  triageAction?: TriageAction
  triageResultId?: string
  createdAt: string
}

export type TicketReportRow = {
  id: string
  execution_id: string
  ticket_id: string
  step_name: string
  run_id: string
  report_type: string
  title: string
  content: string
  data: string | null
  triaged: number
  triage_action: string | null
  triage_result_id: string | null
  created_at: string
}

export type AddReportInput = {
  executionId: string
  ticketId: string
  stepName: string
  runId: string
  reportType: ReportType
  title: string
  content: string
  data?: Record<string, unknown>
}

export interface TicketReportsModule {
  add: (report: AddReportInput) => string
  get: (id: string) => TicketReport | null
  getByRunId: (runId: string) => TicketReport[]
  getByTicketId: (ticketId: string) => TicketReport[]
  getUntriaged: () => TicketReport[]
  markTriaged: (id: string, action: TriageAction, resultId?: string) => void
  listByType: (reportType: ReportType, limit?: number) => TicketReport[]
}

export interface TicketReportsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId?: () => string | null
}

function rowToTicketReport(row: TicketReportRow): TicketReport {
  const result: TicketReport = {
    id: row.id,
    executionId: row.execution_id,
    ticketId: row.ticket_id,
    stepName: row.step_name,
    runId: row.run_id,
    reportType: row.report_type as ReportType,
    title: row.title,
    content: row.content,
    triaged: row.triaged === 1,
    createdAt: row.created_at,
  }

  // Only add optional fields if they have values (exactOptionalPropertyTypes)
  if (row.data) result.data = parseJson<Record<string, unknown>>(row.data, {})
  if (row.triage_action) result.triageAction = row.triage_action as TriageAction
  if (row.triage_result_id) result.triageResultId = row.triage_result_id

  return result
}

export function createTicketReportsModule(ctx: TicketReportsModuleContext): TicketReportsModule {
  const { rdb, getCurrentExecutionId } = ctx

  const ticketReports: TicketReportsModule = {
    add: (report: AddReportInput): string => {
      if (rdb.isClosed) return ''
      const id = uuid()
      const executionId = report.executionId || getCurrentExecutionId?.() || ''
      rdb.run(
        `INSERT INTO ticket_reports (
          id, execution_id, ticket_id, step_name, run_id, report_type, title, content, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          executionId,
          report.ticketId,
          report.stepName,
          report.runId,
          report.reportType,
          report.title,
          report.content,
          report.data ? JSON.stringify(report.data) : null,
        ]
      )
      rdb.invalidate(['ticket_reports'])
      return id
    },

    get: (id: string): TicketReport | null => {
      if (rdb.isClosed) return null
      const row = rdb.queryOne<TicketReportRow>('SELECT * FROM ticket_reports WHERE id = ?', [id])
      return row ? rowToTicketReport(row) : null
    },

    getByRunId: (runId: string): TicketReport[] => {
      if (rdb.isClosed) return []
      const rows = rdb.query<TicketReportRow>(
        'SELECT * FROM ticket_reports WHERE run_id = ? ORDER BY created_at ASC',
        [runId]
      )
      return rows.map(rowToTicketReport)
    },

    getByTicketId: (ticketId: string): TicketReport[] => {
      if (rdb.isClosed) return []
      const rows = rdb.query<TicketReportRow>(
        'SELECT * FROM ticket_reports WHERE ticket_id = ? ORDER BY created_at DESC',
        [ticketId]
      )
      return rows.map(rowToTicketReport)
    },

    getUntriaged: (): TicketReport[] => {
      if (rdb.isClosed) return []
      const rows = rdb.query<TicketReportRow>(
        'SELECT * FROM ticket_reports WHERE triaged = 0 ORDER BY created_at ASC',
        []
      )
      return rows.map(rowToTicketReport)
    },

    markTriaged: (id: string, action: TriageAction, resultId?: string) => {
      if (rdb.isClosed) return
      rdb.run(
        'UPDATE ticket_reports SET triaged = 1, triage_action = ?, triage_result_id = ? WHERE id = ?',
        [action, resultId ?? null, id]
      )
      rdb.invalidate(['ticket_reports'])
    },

    listByType: (reportType: ReportType, limit: number = 100): TicketReport[] => {
      if (rdb.isClosed) return []
      const rows = rdb.query<TicketReportRow>(
        'SELECT * FROM ticket_reports WHERE report_type = ? ORDER BY created_at DESC LIMIT ?',
        [reportType, limit]
      )
      return rows.map(rowToTicketReport)
    },
  }

  return ticketReports
}
