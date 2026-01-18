// VCS/commit/snapshot/review tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite'
import type { Commit, Snapshot, Review, Report } from './types.js'
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
    issues: any[]
    approvals?: any[]
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

// Helper mappers
const mapCommit = (row: any): Commit | null => {
  if (!row) return null
  return {
    ...row,
    files_changed: parseJson(row.files_changed, undefined),
    smithers_metadata: parseJson(row.smithers_metadata, undefined),
  }
}

const mapSnapshot = (row: any): Snapshot | null => {
  if (!row) return null
  return {
    ...row,
    files_modified: parseJson(row.files_modified, undefined),
    files_added: parseJson(row.files_added, undefined),
    files_deleted: parseJson(row.files_deleted, undefined),
    has_conflicts: Boolean(row.has_conflicts),
  }
}

const mapReview = (row: any): Review | null => {
  if (!row) return null
  return {
    ...row,
    approved: Boolean(row.approved),
    issues: parseJson(row.issues, []),
    approvals: parseJson(row.approvals, undefined),
    blocking: Boolean(row.blocking),
    posted_to_github: Boolean(row.posted_to_github),
    posted_to_git_notes: Boolean(row.posted_to_git_notes),
  }
}

const mapReport = (row: any): Report | null => {
  if (!row) return null
  return {
    ...row,
    data: parseJson(row.data, undefined),
  }
}

export function createVcsModule(ctx: VcsModuleContext): VcsModule {
  const { rdb, getCurrentExecutionId } = ctx

  const vcs: VcsModule = {
    logCommit: (commit): string => {
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
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM commits WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapCommit)
        .filter((c): c is Commit => c !== null)
    },

    getCommit: (hash: string, vcsType?: 'git' | 'jj'): Commit | null => {
      if (vcsType) {
        return mapCommit(rdb.queryOne('SELECT * FROM commits WHERE commit_hash = ? AND vcs_type = ?', [hash, vcsType]))
      }
      return mapCommit(rdb.queryOne('SELECT * FROM commits WHERE commit_hash = ?', [hash]))
    },

    logSnapshot: (snapshot): string => {
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
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM snapshots WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapSnapshot)
        .filter((s): s is Snapshot => s !== null)
    },

    logReview: (review): string => {
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
      const sets: string[] = []
      const params: any[] = []
      if (updates.posted_to_github !== undefined) { sets.push('posted_to_github = ?'); params.push(updates.posted_to_github ? 1 : 0) }
      if (updates.posted_to_git_notes !== undefined) { sets.push('posted_to_git_notes = ?'); params.push(updates.posted_to_git_notes ? 1 : 0) }
      if (sets.length > 0) {
        params.push(id)
        rdb.run(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`, params)
      }
    },

    getReviews: (limit: number = 50): Review[] => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM reviews WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapReview)
        .filter((r): r is Review => r !== null)
    },

    getBlockingReviews: (): Review[] => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM reviews WHERE execution_id = ? AND blocking = 1 AND approved = 0', [currentExecutionId])
        .map(mapReview)
        .filter((r): r is Review => r !== null)
    },

    addReport: (report): string => {
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
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      let sql = 'SELECT * FROM reports WHERE execution_id = ?'
      const params: any[] = [currentExecutionId]
      if (type) { sql += ' AND type = ?'; params.push(type) }
      sql += ' ORDER BY created_at DESC LIMIT ?'
      params.push(limit)
      return rdb.query<any>(sql, params)
        .map(mapReport)
        .filter((r): r is Report => r !== null)
    },

    getCriticalReports: (): Report[] => {
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
