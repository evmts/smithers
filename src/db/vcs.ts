// VCS/commit/snapshot/review tracking module for Smithers DB

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

const mapCommit = (row: CommitRow | null): Commit | null => {
  if (!row) return null
  return {
    id: row.id,
    execution_id: row.execution_id,
    agent_id: row.agent_id ?? undefined,
    vcs_type: row.vcs_type as Commit['vcs_type'],
    commit_hash: row.commit_hash,
    change_id: row.change_id ?? undefined,
    message: row.message,
    author: row.author ?? undefined,
    files_changed: row.files_changed ? parseJson(row.files_changed, []) : undefined,
    insertions: row.insertions ?? undefined,
    deletions: row.deletions ?? undefined,
    smithers_metadata: row.smithers_metadata ? parseJson(row.smithers_metadata, {}) : undefined,
    created_at: new Date(row.created_at),
  }
}

const mapSnapshot = (row: SnapshotRow | null): Snapshot | null => {
  if (!row) return null
  return {
    id: row.id,
    execution_id: row.execution_id,
    change_id: row.change_id,
    commit_hash: row.commit_hash ?? undefined,
    description: row.description ?? undefined,
    files_modified: row.files_modified ? parseJson(row.files_modified, []) : undefined,
    files_added: row.files_added ? parseJson(row.files_added, []) : undefined,
    files_deleted: row.files_deleted ? parseJson(row.files_deleted, []) : undefined,
    has_conflicts: row.has_conflicts === 1,
    created_at: new Date(row.created_at),
  }
}

const mapReview = (row: ReviewRow | null): Review | null => {
  if (!row) return null
  return {
    id: row.id,
    execution_id: row.execution_id,
    agent_id: row.agent_id ?? undefined,
    target_type: row.target_type as Review['target_type'],
    target_ref: row.target_ref ?? undefined,
    approved: row.approved === 1,
    summary: row.summary,
    issues: parseJson(row.issues, []),
    approvals: row.approvals ? parseJson(row.approvals, []) : undefined,
    reviewer_model: row.reviewer_model ?? undefined,
    blocking: row.blocking === 1,
    posted_to_github: row.posted_to_github === 1,
    posted_to_git_notes: row.posted_to_git_notes === 1,
    created_at: new Date(row.created_at),
  }
}

const mapReport = (row: ReportRow | null): Report | null => {
  if (!row) return null
  return {
    id: row.id,
    execution_id: row.execution_id,
    agent_id: row.agent_id ?? undefined,
    type: row.type as Report['type'],
    title: row.title,
    content: row.content,
    data: row.data ? parseJson(row.data, {}) : undefined,
    severity: row.severity as Report['severity'],
    created_at: new Date(row.created_at),
  }
}

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
