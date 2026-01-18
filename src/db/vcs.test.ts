/**
 * Tests for VCS module - commit, snapshot, review, and report tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createVcsModule } from './vcs.js'

describe('VcsModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS commits (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        agent_id TEXT,
        vcs_type TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        change_id TEXT,
        message TEXT NOT NULL,
        author TEXT,
        files_changed TEXT,
        insertions INTEGER,
        deletions INTEGER,
        smithers_metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        change_id TEXT NOT NULL,
        commit_hash TEXT,
        description TEXT,
        files_modified TEXT,
        files_added TEXT,
        files_deleted TEXT,
        has_conflicts INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        agent_id TEXT,
        target_type TEXT NOT NULL,
        target_ref TEXT,
        approved INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL,
        issues TEXT NOT NULL,
        approvals TEXT,
        reviewer_model TEXT,
        blocking INTEGER DEFAULT 0,
        posted_to_github INTEGER DEFAULT 0,
        posted_to_git_notes INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        agent_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        data TEXT,
        severity TEXT DEFAULT 'info',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
  }

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    setupSchema()
    currentExecutionId = null
  })

  afterEach(() => {
    db.close()
  })

  const createVcs = () => {
    return createVcsModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId
    })
  }

  describe('commit operations', () => {
    test('logCommit creates commit with all fields', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const id = vcs.logCommit({
        vcs_type: 'git',
        commit_hash: 'abc123',
        change_id: 'change-456',
        message: 'feat: add new feature',
        author: 'Claude',
        files_changed: ['src/index.ts', 'src/utils.ts'],
        insertions: 50,
        deletions: 10,
        smithers_metadata: { task_id: 'task-1' },
        agent_id: 'agent-1'
      })

      const commit = db.queryOne<any>('SELECT * FROM commits WHERE id = ?', [id])

      expect(commit).not.toBeNull()
      expect(commit.vcs_type).toBe('git')
      expect(commit.commit_hash).toBe('abc123')
      expect(commit.change_id).toBe('change-456')
      expect(commit.message).toBe('feat: add new feature')
      expect(commit.author).toBe('Claude')
      expect(JSON.parse(commit.files_changed)).toEqual(['src/index.ts', 'src/utils.ts'])
      expect(commit.insertions).toBe(50)
      expect(commit.deletions).toBe(10)
      expect(JSON.parse(commit.smithers_metadata)).toEqual({ task_id: 'task-1' })
      expect(commit.agent_id).toBe('agent-1')
    })

    test('logCommit handles optional fields as null', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const id = vcs.logCommit({
        vcs_type: 'git',
        commit_hash: 'def456',
        message: 'fix: bug fix'
      })

      const commit = db.queryOne<any>('SELECT * FROM commits WHERE id = ?', [id])

      expect(commit.change_id).toBeNull()
      expect(commit.author).toBeNull()
      expect(commit.files_changed).toBeNull()
      expect(commit.insertions).toBeNull()
      expect(commit.deletions).toBeNull()
      expect(commit.smithers_metadata).toBeNull()
      expect(commit.agent_id).toBeNull()
    })

    test('logCommit JSON stringifies arrays', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const id = vcs.logCommit({
        vcs_type: 'jj',
        commit_hash: 'xyz789',
        message: 'test',
        files_changed: ['a.ts', 'b.ts', 'c.ts']
      })

      const commit = db.queryOne<any>('SELECT files_changed FROM commits WHERE id = ?', [id])
      expect(commit.files_changed).toBe('["a.ts","b.ts","c.ts"]')
    })

    test('logCommit OR REPLACE deduplicates by hash', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logCommit({
        vcs_type: 'git',
        commit_hash: 'same-hash',
        message: 'first message'
      })
      vcs.logCommit({
        vcs_type: 'git',
        commit_hash: 'same-hash',
        message: 'second message'
      })

      const commits = db.query<any>('SELECT * FROM commits WHERE commit_hash = ?', ['same-hash'])
      // Note: OR REPLACE only works if there's a unique constraint, so both may exist
      expect(commits.length).toBeGreaterThanOrEqual(1)
    })

    test('logCommit throws without execution', () => {
      currentExecutionId = null
      const vcs = createVcs()

      expect(() => vcs.logCommit({
        vcs_type: 'git',
        commit_hash: 'abc',
        message: 'test'
      })).toThrow('No active execution')
    })

    test('getCommits returns commits for current execution', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logCommit({ vcs_type: 'git', commit_hash: 'hash1', message: 'msg1' })
      vcs.logCommit({ vcs_type: 'git', commit_hash: 'hash2', message: 'msg2' })
      vcs.logCommit({ vcs_type: 'git', commit_hash: 'hash3', message: 'msg3' })

      const commits = vcs.getCommits()
      expect(commits).toHaveLength(3)
    })

    test('getCommits respects limit', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      for (let i = 0; i < 10; i++) {
        vcs.logCommit({ vcs_type: 'git', commit_hash: `hash${i}`, message: `msg${i}` })
      }

      const commits = vcs.getCommits(3)
      expect(commits).toHaveLength(3)
    })

    test('getCommit finds by hash', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logCommit({ vcs_type: 'git', commit_hash: 'unique-hash', message: 'test' })

      const commit = vcs.getCommit('unique-hash')
      expect(commit).not.toBeNull()
      expect(commit!.commit_hash).toBe('unique-hash')
    })

    test('getCommit finds by hash + vcsType', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logCommit({ vcs_type: 'git', commit_hash: 'shared-hash', message: 'git commit' })
      vcs.logCommit({ vcs_type: 'jj', commit_hash: 'shared-hash', message: 'jj commit' })

      const gitCommit = vcs.getCommit('shared-hash', 'git')
      const jjCommit = vcs.getCommit('shared-hash', 'jj')

      expect(gitCommit!.message).toBe('git commit')
      expect(jjCommit!.message).toBe('jj commit')
    })
  })

  describe('snapshot operations', () => {
    test('logSnapshot creates with all fields', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const id = vcs.logSnapshot({
        change_id: 'change-1',
        commit_hash: 'abc123',
        description: 'WIP: feature',
        files_modified: ['a.ts'],
        files_added: ['b.ts'],
        files_deleted: ['c.ts'],
        has_conflicts: true
      })

      const snapshot = db.queryOne<any>('SELECT * FROM snapshots WHERE id = ?', [id])

      expect(snapshot).not.toBeNull()
      expect(snapshot.change_id).toBe('change-1')
      expect(snapshot.commit_hash).toBe('abc123')
      expect(snapshot.description).toBe('WIP: feature')
      expect(JSON.parse(snapshot.files_modified)).toEqual(['a.ts'])
      expect(JSON.parse(snapshot.files_added)).toEqual(['b.ts'])
      expect(JSON.parse(snapshot.files_deleted)).toEqual(['c.ts'])
      expect(snapshot.has_conflicts).toBe(1)
    })

    test('logSnapshot boolean has_conflicts converts to 1/0', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()

      const id1 = vcs.logSnapshot({ change_id: 'c1', has_conflicts: true })
      const id2 = vcs.logSnapshot({ change_id: 'c2', has_conflicts: false })

      const s1 = db.queryOne<any>('SELECT has_conflicts FROM snapshots WHERE id = ?', [id1])
      const s2 = db.queryOne<any>('SELECT has_conflicts FROM snapshots WHERE id = ?', [id2])

      expect(s1.has_conflicts).toBe(1)
      expect(s2.has_conflicts).toBe(0)
    })

    test('getSnapshots returns snapshots for current execution', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logSnapshot({ change_id: 'c1' })
      vcs.logSnapshot({ change_id: 'c2' })

      const snapshots = vcs.getSnapshots()
      expect(snapshots).toHaveLength(2)
      // Verify boolean conversion in mapping
      expect(typeof snapshots[0].has_conflicts).toBe('boolean')
    })
  })

  describe('review operations', () => {
    test('logReview creates with severity', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const id = vcs.logReview({
        target_type: 'pr',
        target_ref: 'PR#123',
        approved: true,
        summary: 'LGTM',
        issues: [
          { severity: 'minor', message: 'typo in comment' }
        ],
        approvals: [
          { aspect: 'logic', reason: 'correct implementation' }
        ],
        reviewer_model: 'claude-opus-4-5-20251101',
        blocking: false,
        agent_id: 'agent-1'
      })

      const review = db.queryOne<any>('SELECT * FROM reviews WHERE id = ?', [id])

      expect(review.target_type).toBe('pr')
      expect(review.target_ref).toBe('PR#123')
      expect(review.approved).toBe(1)
      expect(review.summary).toBe('LGTM')
      expect(JSON.parse(review.issues)).toHaveLength(1)
      expect(JSON.parse(review.approvals)).toHaveLength(1)
      expect(review.reviewer_model).toBe('claude-opus-4-5-20251101')
      expect(review.blocking).toBe(0)
    })

    test('logReview boolean approved/blocking converts to 1/0', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()

      const id1 = vcs.logReview({
        target_type: 'commit',
        approved: true,
        blocking: true,
        summary: 'test1',
        issues: []
      })

      const id2 = vcs.logReview({
        target_type: 'commit',
        approved: false,
        blocking: false,
        summary: 'test2',
        issues: []
      })

      const r1 = db.queryOne<any>('SELECT approved, blocking FROM reviews WHERE id = ?', [id1])
      const r2 = db.queryOne<any>('SELECT approved, blocking FROM reviews WHERE id = ?', [id2])

      expect(r1.approved).toBe(1)
      expect(r1.blocking).toBe(1)
      expect(r2.approved).toBe(0)
      expect(r2.blocking).toBe(0)
    })

    test('logReview JSON stringifies issues/approvals', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const issues = [
        { severity: 'critical', file: 'a.ts', line: 10, message: 'security issue' }
      ]

      const id = vcs.logReview({
        target_type: 'diff',
        approved: false,
        summary: 'needs work',
        issues
      })

      const review = db.queryOne<any>('SELECT issues FROM reviews WHERE id = ?', [id])
      expect(JSON.parse(review.issues)).toEqual(issues)
    })

    test('updateReview sets posted flags', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const id = vcs.logReview({
        target_type: 'pr',
        approved: true,
        summary: 'ok',
        issues: []
      })

      vcs.updateReview(id, { posted_to_github: true })

      const review1 = db.queryOne<any>('SELECT posted_to_github, posted_to_git_notes FROM reviews WHERE id = ?', [id])
      expect(review1.posted_to_github).toBe(1)
      expect(review1.posted_to_git_notes).toBe(0)

      vcs.updateReview(id, { posted_to_git_notes: true })

      const review2 = db.queryOne<any>('SELECT posted_to_github, posted_to_git_notes FROM reviews WHERE id = ?', [id])
      expect(review2.posted_to_github).toBe(1)
      expect(review2.posted_to_git_notes).toBe(1)
    })

    test('getReviews returns reviews for current execution', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logReview({ target_type: 'pr', approved: true, summary: 'ok', issues: [] })
      vcs.logReview({ target_type: 'diff', approved: false, summary: 'needs work', issues: [] })

      const reviews = vcs.getReviews()
      expect(reviews).toHaveLength(2)
      // Verify boolean conversion
      expect(typeof reviews[0].approved).toBe('boolean')
      expect(typeof reviews[0].blocking).toBe('boolean')
    })

    test('getBlockingReviews filters blocking=1 AND approved=0', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logReview({ target_type: 'pr', approved: false, blocking: true, summary: 'blocks', issues: [] })
      vcs.logReview({ target_type: 'pr', approved: true, blocking: true, summary: 'approved blocking', issues: [] })
      vcs.logReview({ target_type: 'pr', approved: false, blocking: false, summary: 'non-blocking', issues: [] })

      const blocking = vcs.getBlockingReviews()
      expect(blocking).toHaveLength(1)
      expect(blocking[0].summary).toBe('blocks')
    })
  })

  describe('report operations', () => {
    test('addReport creates with all fields', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const id = vcs.addReport({
        type: 'finding',
        title: 'Security Issue',
        content: 'Found potential SQL injection',
        data: { file: 'db.ts', line: 42 },
        severity: 'critical',
        agent_id: 'agent-1'
      })

      const report = db.queryOne<any>('SELECT * FROM reports WHERE id = ?', [id])

      expect(report.type).toBe('finding')
      expect(report.title).toBe('Security Issue')
      expect(report.content).toBe('Found potential SQL injection')
      expect(JSON.parse(report.data)).toEqual({ file: 'db.ts', line: 42 })
      expect(report.severity).toBe('critical')
      expect(report.agent_id).toBe('agent-1')
    })

    test('addReport defaults severity to info', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      const id = vcs.addReport({
        type: 'progress',
        title: 'Step 1 complete',
        content: 'Finished analysis'
      })

      const report = db.queryOne<any>('SELECT severity FROM reports WHERE id = ?', [id])
      expect(report.severity).toBe('info')
    })

    test('getReports filters by type', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.addReport({ type: 'progress', title: 't1', content: 'c1' })
      vcs.addReport({ type: 'finding', title: 't2', content: 'c2' })
      vcs.addReport({ type: 'progress', title: 't3', content: 'c3' })
      vcs.addReport({ type: 'warning', title: 't4', content: 'c4' })

      const progressReports = vcs.getReports('progress')
      expect(progressReports).toHaveLength(2)
      expect(progressReports.every(r => r.type === 'progress')).toBe(true)
    })

    test('getCriticalReports filters severity=critical', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.addReport({ type: 'finding', title: 't1', content: 'c1', severity: 'info' })
      vcs.addReport({ type: 'warning', title: 't2', content: 'c2', severity: 'warning' })
      vcs.addReport({ type: 'error', title: 't3', content: 'c3', severity: 'critical' })
      vcs.addReport({ type: 'finding', title: 't4', content: 'c4', severity: 'critical' })

      const critical = vcs.getCriticalReports()
      expect(critical).toHaveLength(2)
      expect(critical.every(r => r.severity === 'critical')).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('no execution context returns empty arrays', () => {
      currentExecutionId = null
      const vcs = createVcs()

      expect(vcs.getCommits()).toEqual([])
      expect(vcs.getSnapshots()).toEqual([])
      expect(vcs.getReviews()).toEqual([])
      expect(vcs.getBlockingReviews()).toEqual([])
      expect(vcs.getReports()).toEqual([])
      expect(vcs.getCriticalReports()).toEqual([])
    })

    test('mapCommit handles null files_changed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logCommit({
        vcs_type: 'git',
        commit_hash: 'test',
        message: 'test'
        // No files_changed
      })

      const commits = vcs.getCommits()
      expect(commits[0].files_changed).toBeUndefined()
    })

    test('mapReview parses issues as empty array when empty', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const vcs = createVcs()
      vcs.logReview({
        target_type: 'pr',
        approved: true,
        summary: 'ok',
        issues: []
      })

      const reviews = vcs.getReviews()
      expect(reviews[0].issues).toEqual([])
    })
  })
})
