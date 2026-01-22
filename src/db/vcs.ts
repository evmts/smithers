import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Commit, Snapshot, Review, Report, ReviewIssue, ReviewApproval } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface VcsModule {
  logCommit: (commit: {
    vcs_type: 'git' | 'jj'
    commit_hash: string
    change_id?: string
    message: string
    author?: string
    files_changed?: string[]
    insertions?: number
    deletions?: number
    smithers_metadata?: Record<string, any>
    agent_id?: string
  }) => string
  getCommits: (limit?: number) => Commit[]
  getCommit: (hash: string, vcsType?: 'git' | 'jj') => Commit | null
  logSnapshot: (snapshot: {
    change_id: string
    commit_hash?: string
    description?: string
    files_modified?: string[]
    files_added?: string[]
    files_deleted?: string[]
    has_conflicts?: boolean
  }) => string
  getSnapshots: (limit?: number) => Snapshot[]
  logReview: (review: {
    target_type: 'commit' | 'diff' | 'pr' | 'files'
    target_ref?: string
    approved: boolean
    summary: string
    issues: ReviewIssue[]
    approvals?: ReviewApproval[]
    reviewer_model?: string
    blocking?: boolean
    agent_id?: string
  }) => string
  updateReview: (id: string, updates: { posted_to_github?: boolean; posted_to_git_notes?: boolean }) => void
  getReviews: (limit?: number) => Review[]
  getBlockingReviews: () => Review[]
  addReport: (report: {
    type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
    title: string
    content: string
    data?: Record<string, any>
    severity?: 'info' | 'warning' | 'critical'
    agent_id?: string
  }) => string
  getReports: (type?: Report['type'], limit?: number) => Report[]
  getCriticalReports: () => Report[]
}

export interface VcsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

interface CommitRow {
  id: string
  execution_id: string
  agent_id: string | null
  vcs_type: string
  commit_hash: string
  change_id: string | null
  message: string
  author: string | null
  files_changed: string | null
  insertions: number | null
  deletions: number | null
  smithers_metadata: string | null
  created_at: string
}

interface SnapshotRow {
  id: string
  execution_id: string
  change_id: string
  commit_hash: string | null
  description: string | null
  files_modified: string | null
  files_added: string | null
  files_deleted: string | null
  has_conflicts: number
  created_at: string
}

interface ReviewRow {
  id: string
  execution_id: string
  agent_id: string | null
  target_type: string
  target_ref: string | null
  approved: number
  summary: string
  issues: string | null
  approvals: string | null
  reviewer_model: string | null
  blocking: number
  posted_to_github: number
  posted_to_git_notes: number
  created_at: string
}

interface ReportRow {
  id: string
  execution_id: string
  agent_id: string | null
  type: string
  title: string
  content: string
  data: string | null
  severity: string
  created_at: string
}

type FieldMapper<R, T> = (row: R) => T
type FieldSpec<R, T> = keyof R | FieldMapper<R, T>

function mapRow<R extends { created_at: string }, T>(
  row: R | null,
  spec: { [K in keyof T]: FieldSpec<R, T[K]> }
): T | null {
  if (!row) return null
  const result = {} as T
  for (const key in spec) {
    const field = spec[key]
    if (typeof field === 'function') {
      result[key] = (field as FieldMapper<R, T[typeof key]>)(row)
    } else {
      const val = row[field as keyof R]
      result[key] = (val ?? undefined) as T[typeof key]
    }
  }
  return result
}

const mapCommit = (row: CommitRow | null): Commit | null =>
  mapRow<CommitRow, Commit>(row, {
    id: 'id',
    execution_id: 'execution_id',
    agent_id: 'agent_id',
    vcs_type: r => r.vcs_type as Commit['vcs_type'],
    commit_hash: 'commit_hash',
    change_id: 'change_id',
    message: 'message',
    author: 'author',
    files_changed: r => r.files_changed ? parseJson(r.files_changed, []) : undefined,
    insertions: 'insertions',
    deletions: 'deletions',
    smithers_metadata: r => r.smithers_metadata ? parseJson(r.smithers_metadata, {}) : undefined,
    created_at: r => new Date(r.created_at),
  })

const mapSnapshot = (row: SnapshotRow | null): Snapshot | null =>
  mapRow<SnapshotRow, Snapshot>(row, {
    id: 'id',
    execution_id: 'execution_id',
    change_id: 'change_id',
    commit_hash: 'commit_hash',
    description: 'description',
    files_modified: r => r.files_modified ? parseJson(r.files_modified, []) : undefined,
    files_added: r => r.files_added ? parseJson(r.files_added, []) : undefined,
    files_deleted: r => r.files_deleted ? parseJson(r.files_deleted, []) : undefined,
    has_conflicts: r => r.has_conflicts === 1,
    created_at: r => new Date(r.created_at),
  })

const mapReview = (row: ReviewRow | null): Review | null =>
  mapRow<ReviewRow, Review>(row, {
    id: 'id',
    execution_id: 'execution_id',
    agent_id: 'agent_id',
    target_type: r => r.target_type as Review['target_type'],
    target_ref: 'target_ref',
    approved: r => r.approved === 1,
    summary: 'summary',
    issues: r => parseJson(r.issues, []),
    approvals: r => r.approvals ? parseJson(r.approvals, []) : undefined,
    reviewer_model: 'reviewer_model',
    blocking: r => r.blocking === 1,
    posted_to_github: r => r.posted_to_github === 1,
    posted_to_git_notes: r => r.posted_to_git_notes === 1,
    created_at: r => new Date(r.created_at),
  })

const mapReport = (row: ReportRow | null): Report | null =>
  mapRow<ReportRow, Report>(row, {
    id: 'id',
    execution_id: 'execution_id',
    agent_id: 'agent_id',
    type: r => r.type as Report['type'],
    title: 'title',
    content: 'content',
    data: r => r.data ? parseJson(r.data, {}) : undefined,
    severity: r => r.severity as Report['severity'],
    created_at: r => new Date(r.created_at),
  })

export function createVcsModule(ctx: VcsModuleContext): VcsModule {
  const { rdb, getCurrentExecutionId } = ctx

  const vcs: VcsModule = {
    logCommit: (commit): string => {
      if (rdb.isClosed) return uuid()
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT OR REPLACE INTO commits (id, execution_id, agent_id, vcs_type, commit_hash, change_id, message, author, files_changed, insertions, deletions, smithers_metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, commit.agent_id ?? null, commit.vcs_type, commit.commit_hash,
         commit.change_id ?? null, commit.message, commit.author ?? null,
         commit.files_changed ? JSON.stringify(commit.files_changed) : null,
         commit.insertions ?? null, commit.deletions ?? null,
         commit.smithers_metadata ? JSON.stringify(commit.smithers_metadata) : null, now()]
      )
      return id
    },

    getCommits: (limit: number = 50): Commit[] => {
      if (rdb.isClosed) return []
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM commits WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapCommit)
        .filter((c): c is Commit => c !== null)
    },

    getCommit: (hash: string, vcsType?: 'git' | 'jj'): Commit | null => {
      if (rdb.isClosed) return null
      if (vcsType) {
        return mapCommit(rdb.queryOne('SELECT * FROM commits WHERE commit_hash = ? AND vcs_type = ?', [hash, vcsType]))
      }
      return mapCommit(rdb.queryOne('SELECT * FROM commits WHERE commit_hash = ?', [hash]))
    },

    logSnapshot: (snapshot): string => {
      if (rdb.isClosed) return uuid()
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO snapshots (id, execution_id, change_id, commit_hash, description, files_modified, files_added, files_deleted, has_conflicts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, snapshot.change_id, snapshot.commit_hash ?? null,
         snapshot.description ?? null,
         snapshot.files_modified ? JSON.stringify(snapshot.files_modified) : null,
         snapshot.files_added ? JSON.stringify(snapshot.files_added) : null,
         snapshot.files_deleted ? JSON.stringify(snapshot.files_deleted) : null,
         snapshot.has_conflicts ? 1 : 0, now()]
      )
      return id
    },

    getSnapshots: (limit: number = 50): Snapshot[] => {
      if (rdb.isClosed) return []
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM snapshots WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapSnapshot)
        .filter((s): s is Snapshot => s !== null)
    },

    logReview: (review): string => {
      if (rdb.isClosed) return uuid()
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO reviews (id, execution_id, agent_id, target_type, target_ref, approved, summary, issues, approvals, reviewer_model, blocking, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, review.agent_id ?? null, review.target_type,
         review.target_ref ?? null, review.approved ? 1 : 0, review.summary,
         JSON.stringify(review.issues), review.approvals ? JSON.stringify(review.approvals) : null,
         review.reviewer_model ?? null, review.blocking ? 1 : 0, now()]
      )
      return id
    },

    updateReview: (id: string, updates: { posted_to_github?: boolean; posted_to_git_notes?: boolean }) => {
      if (rdb.isClosed) return
      const sets: string[] = []
      const params: (string | number)[] = []
      if (updates.posted_to_github !== undefined) { sets.push('posted_to_github = ?'); params.push(updates.posted_to_github ? 1 : 0) }
      if (updates.posted_to_git_notes !== undefined) { sets.push('posted_to_git_notes = ?'); params.push(updates.posted_to_git_notes ? 1 : 0) }
      if (sets.length > 0) {
        params.push(id)
        rdb.run(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`, params)
      }
    },

    getReviews: (limit: number = 50): Review[] => {
      if (rdb.isClosed) return []
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM reviews WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapReview)
        .filter((r): r is Review => r !== null)
    },

    getBlockingReviews: (): Review[] => {
      if (rdb.isClosed) return []
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM reviews WHERE execution_id = ? AND blocking = 1 AND approved = 0', [currentExecutionId])
        .map(mapReview)
        .filter((r): r is Review => r !== null)
    },

    addReport: (report): string => {
      if (rdb.isClosed) return uuid()
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO reports (id, execution_id, agent_id, type, title, content, data, severity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, report.agent_id ?? null, report.type, report.title, report.content,
         report.data ? JSON.stringify(report.data) : null, report.severity ?? 'info', now()]
      )
      return id
    },

    getReports: (type?: Report['type'], limit: number = 100): Report[] => {
      if (rdb.isClosed) return []
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      let sql = 'SELECT * FROM reports WHERE execution_id = ?'
      const params: (string | number)[] = [currentExecutionId]
      if (type) { sql += ' AND type = ?'; params.push(type) }
      sql += ' ORDER BY created_at DESC LIMIT ?'
      params.push(limit)
      return rdb.query<any>(sql, params)
        .map(mapReport)
        .filter((r): r is Report => r !== null)
    },

    getCriticalReports: (): Report[] => {
      if (rdb.isClosed) return []
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>(
        "SELECT * FROM reports WHERE execution_id = ? AND severity = 'critical' ORDER BY created_at DESC",
        [currentExecutionId]
      )
        .map(mapReport)
        .filter((r): r is Report => r !== null)
    },
  }

  return vcs
}
