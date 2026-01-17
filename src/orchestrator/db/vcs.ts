// VCS tracking - commits, snapshots, reviews, reports

import type { PGlite } from '@electric-sql/pglite'
import { QueryHelpers } from './live-query.js'
import type { Commit, Snapshot, Review, Report } from './types.js'

export class VCSManager {
  private queries: QueryHelpers
  private currentExecutionId: string

  constructor(private pg: PGlite, executionId: string) {
    this.queries = new QueryHelpers(pg)
    this.currentExecutionId = executionId
  }

  // ============================================================================
  // COMMITS
  // ============================================================================

  /**
   * Log a commit to the database
   */
  async logCommit(commit: {
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
  }): Promise<string> {
    const result = await this.pg.query(
      `INSERT INTO commits (
        execution_id,
        agent_id,
        vcs_type,
        commit_hash,
        change_id,
        message,
        author,
        files_changed,
        insertions,
        deletions,
        smithers_metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id`,
      [
        this.currentExecutionId,
        commit.agent_id ?? null,
        commit.vcs_type,
        commit.commit_hash,
        commit.change_id ?? null,
        commit.message,
        commit.author ?? null,
        commit.files_changed ?? null,
        commit.insertions ?? null,
        commit.deletions ?? null,
        commit.smithers_metadata ? JSON.stringify(commit.smithers_metadata) : null,
      ]
    )

    return result.rows[0].id
  }

  /**
   * Get commits for current execution
   */
  async getCommits(limit: number = 100): Promise<Commit[]> {
    return this.queries.query<Commit>(
      `SELECT * FROM commits
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [this.currentExecutionId, limit]
    )
  }

  /**
   * Get a specific commit by hash
   */
  async getCommit(hash: string, vcsType: 'git' | 'jj' = 'git'): Promise<Commit | null> {
    return this.queries.queryOne<Commit>(
      'SELECT * FROM commits WHERE commit_hash = $1 AND vcs_type = $2',
      [hash, vcsType]
    )
  }

  // ============================================================================
  // SNAPSHOTS
  // ============================================================================

  /**
   * Log a JJ snapshot
   */
  async logSnapshot(snapshot: {
    change_id: string
    commit_hash?: string
    description?: string
    files_modified?: string[]
    files_added?: string[]
    files_deleted?: string[]
    has_conflicts?: boolean
  }): Promise<string> {
    const result = await this.pg.query(
      `INSERT INTO snapshots (
        execution_id,
        change_id,
        commit_hash,
        description,
        files_modified,
        files_added,
        files_deleted,
        has_conflicts,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id`,
      [
        this.currentExecutionId,
        snapshot.change_id,
        snapshot.commit_hash ?? null,
        snapshot.description ?? null,
        snapshot.files_modified ?? null,
        snapshot.files_added ?? null,
        snapshot.files_deleted ?? null,
        snapshot.has_conflicts ?? false,
      ]
    )

    return result.rows[0].id
  }

  /**
   * Get snapshots for current execution
   */
  async getSnapshots(limit: number = 100): Promise<Snapshot[]> {
    return this.queries.query<Snapshot>(
      `SELECT * FROM snapshots
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [this.currentExecutionId, limit]
    )
  }

  // ============================================================================
  // REVIEWS
  // ============================================================================

  /**
   * Log a code review
   */
  async logReview(review: {
    target_type: 'commit' | 'diff' | 'pr' | 'files'
    target_ref?: string
    approved: boolean
    summary: string
    issues: any[]
    approvals?: any[]
    reviewer_model?: string
    blocking?: boolean
    agent_id?: string
  }): Promise<string> {
    const result = await this.pg.query(
      `INSERT INTO reviews (
        execution_id,
        agent_id,
        target_type,
        target_ref,
        approved,
        summary,
        issues,
        approvals,
        reviewer_model,
        blocking,
        posted_to_github,
        posted_to_git_notes,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, false, NOW())
      RETURNING id`,
      [
        this.currentExecutionId,
        review.agent_id ?? null,
        review.target_type,
        review.target_ref ?? null,
        review.approved,
        review.summary,
        JSON.stringify(review.issues),
        review.approvals ? JSON.stringify(review.approvals) : null,
        review.reviewer_model ?? null,
        review.blocking ?? false,
      ]
    )

    return result.rows[0].id
  }

  /**
   * Update review posting status
   */
  async updateReview(
    id: string,
    updates: {
      posted_to_github?: boolean
      posted_to_git_notes?: boolean
    }
  ): Promise<void> {
    const sets: string[] = []
    const params: any[] = []

    if (updates.posted_to_github !== undefined) {
      params.push(updates.posted_to_github)
      sets.push(`posted_to_github = $${params.length}`)
    }

    if (updates.posted_to_git_notes !== undefined) {
      params.push(updates.posted_to_git_notes)
      sets.push(`posted_to_git_notes = $${params.length}`)
    }

    if (sets.length === 0) return

    params.push(id)
    await this.pg.query(
      `UPDATE reviews SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  /**
   * Get reviews for current execution
   */
  async getReviews(limit: number = 100): Promise<Review[]> {
    return this.queries.query<Review>(
      `SELECT * FROM reviews
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [this.currentExecutionId, limit]
    )
  }

  /**
   * Get blocking reviews that failed
   */
  async getBlockingReviews(): Promise<Review[]> {
    return this.queries.query<Review>(
      `SELECT * FROM reviews
       WHERE execution_id = $1
       AND blocking = true
       AND approved = false
       ORDER BY created_at DESC`,
      [this.currentExecutionId]
    )
  }

  // ============================================================================
  // REPORTS
  // ============================================================================

  /**
   * Add a report from an agent
   */
  async addReport(report: {
    type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
    title: string
    content: string
    data?: Record<string, any>
    severity?: 'info' | 'warning' | 'critical'
    agent_id?: string
  }): Promise<string> {
    const result = await this.pg.query(
      `INSERT INTO reports (
        execution_id,
        agent_id,
        type,
        title,
        content,
        data,
        severity,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id`,
      [
        this.currentExecutionId,
        report.agent_id ?? null,
        report.type,
        report.title,
        report.content,
        report.data ? JSON.stringify(report.data) : null,
        report.severity ?? 'info',
      ]
    )

    return result.rows[0].id
  }

  /**
   * Get reports, optionally filtered by type
   */
  async getReports(
    type?: Report['type'],
    limit: number = 100
  ): Promise<Report[]> {
    if (type) {
      return this.queries.query<Report>(
        `SELECT * FROM reports
         WHERE execution_id = $1 AND type = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [this.currentExecutionId, type, limit]
      )
    }

    return this.queries.query<Report>(
      `SELECT * FROM reports
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [this.currentExecutionId, limit]
    )
  }

  /**
   * Get critical reports
   */
  async getCriticalReports(): Promise<Report[]> {
    return this.queries.query<Report>(
      `SELECT * FROM reports
       WHERE execution_id = $1 AND severity = 'critical'
       ORDER BY created_at DESC`,
      [this.currentExecutionId]
    )
  }
}
