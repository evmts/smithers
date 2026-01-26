import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now, parseJson } from './utils.js'
import { createDebugLogger } from '../utils/debug.js'

const log = createDebugLogger('DB:Tickets')

export type TicketStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

export type TicketBudget = {
  maxFilesChanged: number
  maxLOC: number
}

export type Ticket = {
  id: string
  priority: number // lower = higher priority (0 is highest)
  title: string
  description: string
  deps?: string[]
  acceptance: string[]
  smallestStepHint: string
  relevantFiles?: string[]
  requiresE2E?: boolean
  budgets?: TicketBudget
  tags?: string[]
}

export type TicketRow = {
  id: string
  priority: number
  title: string
  description: string
  deps: string // JSON
  acceptance: string // JSON
  smallest_step_hint: string
  relevant_files: string // JSON
  requires_e2e: number
  budgets: string | null // JSON
  tags: string // JSON
  status: TicketStatus
  progress_notes: string // JSON
  blocked_reason: string | null
  last_run_at: string | null
  last_report_path: string | null
  last_review_dir: string | null
  last_ticket_goal: string | null
  source: string
  source_report_id: string | null
  created_at: string
  updated_at: string
}

export type TicketWithState = Ticket & {
  status: TicketStatus
  progressNotes: string[]
  blockedReason?: string
  lastRunAt?: string
  lastReportPath?: string
  lastReviewDir?: string
  lastTicketGoal?: string
  source: string
  sourceReportId?: string
  createdAt: string
  updatedAt: string
}

export type TicketFilter = {
  status?: TicketStatus | TicketStatus[]
  tags?: string[]
  requiresE2E?: boolean
  excludeBlocked?: boolean
}

export interface TicketsModule {
  seed: (tickets: Ticket[]) => void
  get: (id: string) => TicketWithState | null
  list: (filter?: TicketFilter) => TicketWithState[]
  selectNext: (excludeId?: string) => TicketWithState | null
  updateStatus: (id: string, status: TicketStatus, blockedReason?: string) => void
  addProgressNote: (id: string, note: string) => void
  setLastRun: (id: string, data: { runAt: string; reportPath?: string; reviewDir?: string; ticketGoal?: string }) => void
  createFromTriage: (ticket: Ticket, sourceReportId: string) => string
  areDepsComplete: (ticketId: string) => boolean
}

export interface TicketsModuleContext {
  rdb: ReactiveDatabase
}

function rowToTicketWithState(row: TicketRow): TicketWithState {
  const deps = parseJson<string[]>(row.deps, [])
  const relevantFiles = parseJson<string[]>(row.relevant_files, [])
  const tags = parseJson<string[]>(row.tags, [])
  const budgets = row.budgets ? parseJson<TicketBudget | null>(row.budgets, null) : null

  const result: TicketWithState = {
    id: row.id,
    priority: row.priority,
    title: row.title,
    description: row.description,
    acceptance: parseJson<string[]>(row.acceptance, []),
    smallestStepHint: row.smallest_step_hint,
    requiresE2E: row.requires_e2e === 1,
    status: row.status,
    progressNotes: parseJson<string[]>(row.progress_notes, []),
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  // Only add optional fields if they have values (exactOptionalPropertyTypes)
  if (deps.length > 0) result.deps = deps
  if (relevantFiles.length > 0) result.relevantFiles = relevantFiles
  if (tags.length > 0) result.tags = tags
  if (budgets) result.budgets = budgets
  if (row.blocked_reason) result.blockedReason = row.blocked_reason
  if (row.last_run_at) result.lastRunAt = row.last_run_at
  if (row.last_report_path) result.lastReportPath = row.last_report_path
  if (row.last_review_dir) result.lastReviewDir = row.last_review_dir
  if (row.last_ticket_goal) result.lastTicketGoal = row.last_ticket_goal
  if (row.source_report_id) result.sourceReportId = row.source_report_id

  return result
}

export function createTicketsModule(ctx: TicketsModuleContext): TicketsModule {
  const { rdb } = ctx

  const tickets: TicketsModule = {
    seed: (ticketList: Ticket[]) => {
      log.enter('seed', { ticketCount: ticketList.length, isClosed: rdb.isClosed })
      if (rdb.isClosed) {
        log.warn('seed: DB is closed, returning')
        return
      }
      try {
        rdb.transaction(() => {
          for (const t of ticketList) {
            log.debug(`seed: Inserting ticket ${t.id}`)
            rdb.run(
            `INSERT OR IGNORE INTO tickets (
              id, priority, title, description, deps, acceptance, smallest_step_hint,
              relevant_files, requires_e2e, budgets, tags, status, progress_notes, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', '[]', 'seed')`,
            [
              t.id,
              t.priority,
              t.title,
              t.description,
              JSON.stringify(t.deps ?? []),
              JSON.stringify(t.acceptance),
              t.smallestStepHint,
              JSON.stringify(t.relevantFiles ?? []),
              t.requiresE2E ? 1 : 0,
              t.budgets ? JSON.stringify(t.budgets) : null,
              JSON.stringify(t.tags ?? []),
            ]
          )
        }
        })
        log.info('seed: Transaction complete, invalidating')
        rdb.invalidate(['tickets'])
        log.exit('seed', { success: true })
      } catch (e) {
        log.error('seed: Error', e)
        throw e
      }
    },

    get: (id: string): TicketWithState | null => {
      if (rdb.isClosed) return null
      const row = rdb.queryOne<TicketRow>('SELECT * FROM tickets WHERE id = ?', [id])
      return row ? rowToTicketWithState(row) : null
    },

    list: (filter?: TicketFilter): TicketWithState[] => {
      if (rdb.isClosed) return []

      const conditions: string[] = []
      const params: unknown[] = []

      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          conditions.push(`status IN (${filter.status.map(() => '?').join(', ')})`)
          params.push(...filter.status)
        } else {
          conditions.push('status = ?')
          params.push(filter.status)
        }
      }

      if (filter?.excludeBlocked) {
        conditions.push("status != 'blocked'")
      }

      if (filter?.requiresE2E !== undefined) {
        conditions.push('requires_e2e = ?')
        params.push(filter.requiresE2E ? 1 : 0)
      }

      // Tags filter uses JSON - check if any tag matches
      if (filter?.tags?.length) {
        const tagConditions = filter.tags.map(() => "tags LIKE ?")
        conditions.push(`(${tagConditions.join(' OR ')})`)
        params.push(...filter.tags.map(t => `%"${t}"%`))
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const rows = rdb.query<TicketRow>(`SELECT * FROM tickets ${where} ORDER BY priority ASC`, params)
      return rows.map(rowToTicketWithState)
    },

    selectNext: (excludeId?: string): TicketWithState | null => {
      log.enter('selectNext', { excludeId, isClosed: rdb.isClosed })
      if (rdb.isClosed) {
        log.warn('selectNext: DB is closed')
        return null
      }

      // First try to find an in_progress ticket with complete deps
      const inProgress = rdb.query<TicketRow>(
        "SELECT * FROM tickets WHERE status = 'in_progress' ORDER BY priority ASC",
        []
      )
      log.debug('selectNext: Found in_progress tickets', { count: inProgress.length })
      for (const row of inProgress) {
        if (excludeId && row.id === excludeId) continue
        if (tickets.areDepsComplete(row.id)) {
          log.exit('selectNext', { ticketId: row.id, source: 'in_progress' })
          return rowToTicketWithState(row)
        }
      }

      // Then find the lowest priority todo ticket with complete deps
      const todos = rdb.query<TicketRow>(
        "SELECT * FROM tickets WHERE status = 'todo' ORDER BY priority ASC",
        []
      )
      log.debug('selectNext: Found todo tickets', { count: todos.length })
      for (const row of todos) {
        if (excludeId && row.id === excludeId) continue
        if (tickets.areDepsComplete(row.id)) {
          log.exit('selectNext', { ticketId: row.id, source: 'todo' })
          return rowToTicketWithState(row)
        }
      }

      log.exit('selectNext', { ticketId: null })
      return null
    },

    updateStatus: (id: string, status: TicketStatus, blockedReason?: string) => {
      log.enter('updateStatus', { id, status, blockedReason })
      if (rdb.isClosed) {
        log.warn('updateStatus: DB is closed')
        return
      }
      rdb.run(
        'UPDATE tickets SET status = ?, blocked_reason = ?, updated_at = ? WHERE id = ?',
        [status, blockedReason ?? null, now(), id]
      )
      rdb.invalidate(['tickets'])
      log.info(`updateStatus: Ticket ${id} -> ${status}`)
      log.exit('updateStatus')
    },

    addProgressNote: (id: string, note: string) => {
      if (rdb.isClosed) return
      const row = rdb.queryOne<{ progress_notes: string }>('SELECT progress_notes FROM tickets WHERE id = ?', [id])
      if (!row) return
      const notes = parseJson<string[]>(row.progress_notes, [])
      notes.push(note)
      rdb.run(
        'UPDATE tickets SET progress_notes = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(notes), now(), id]
      )
      rdb.invalidate(['tickets'])
    },

    setLastRun: (id: string, data: { runAt: string; reportPath?: string; reviewDir?: string; ticketGoal?: string }) => {
      if (rdb.isClosed) return
      rdb.run(
        `UPDATE tickets SET
          last_run_at = ?,
          last_report_path = COALESCE(?, last_report_path),
          last_review_dir = COALESCE(?, last_review_dir),
          last_ticket_goal = COALESCE(?, last_ticket_goal),
          updated_at = ?
        WHERE id = ?`,
        [data.runAt, data.reportPath ?? null, data.reviewDir ?? null, data.ticketGoal ?? null, now(), id]
      )
      rdb.invalidate(['tickets'])
    },

    createFromTriage: (ticket: Ticket, sourceReportId: string): string => {
      if (rdb.isClosed) return ''
      const id = ticket.id || `TRIAGE-${uuid().slice(0, 8)}`
      rdb.run(
        `INSERT INTO tickets (
          id, priority, title, description, deps, acceptance, smallest_step_hint,
          relevant_files, requires_e2e, budgets, tags, status, progress_notes, source, source_report_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', '[]', 'triage', ?)`,
        [
          id,
          ticket.priority,
          ticket.title,
          ticket.description,
          JSON.stringify(ticket.deps ?? []),
          JSON.stringify(ticket.acceptance),
          ticket.smallestStepHint,
          JSON.stringify(ticket.relevantFiles ?? []),
          ticket.requiresE2E ? 1 : 0,
          ticket.budgets ? JSON.stringify(ticket.budgets) : null,
          JSON.stringify(ticket.tags ?? []),
          sourceReportId,
        ]
      )
      rdb.invalidate(['tickets'])
      return id
    },

    areDepsComplete: (ticketId: string): boolean => {
      if (rdb.isClosed) return false
      const row = rdb.queryOne<{ deps: string }>('SELECT deps FROM tickets WHERE id = ?', [ticketId])
      if (!row) return false
      const deps = parseJson<string[]>(row.deps, [])
      if (deps.length === 0) return true

      for (const depId of deps) {
        const depRow = rdb.queryOne<{ status: string }>('SELECT status FROM tickets WHERE id = ?', [depId])
        if (!depRow || depRow.status !== 'done') return false
      }
      return true
    },
  }

  return tickets
}
