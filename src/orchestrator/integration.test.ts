/**
 * Integration Tests for Smithers Orchestrator
 *
 * Tests verify:
 * 1. Database schema with new tables (reports, commits, snapshots, reviews, steps)
 * 2. VCSManager operations
 * 3. Component imports and basic functionality
 */

import { test, expect, beforeAll, afterAll, describe } from 'bun:test'
import { createSmithersDB, type SmithersDB } from './db'
import { VCSManager } from './db/vcs'
import { rmSync, mkdirSync } from 'fs'

const TEST_DB_PATH = '.smithers/test-integration'

describe('Smithers Orchestrator Integration', () => {
  let db: SmithersDB
  let executionId: string

  beforeAll(async () => {
    // Clean up any existing test database
    try {
      rmSync(TEST_DB_PATH, { recursive: true, force: true })
    } catch {
      // Ignore if doesn't exist
    }
    mkdirSync(TEST_DB_PATH, { recursive: true })

    // Create database
    db = await createSmithersDB({ path: TEST_DB_PATH })

    // Start an execution for testing
    executionId = await db.execution.start('Test Execution', 'integration.test.ts', {
      maxIterations: 5,
      model: 'sonnet',
    })
  })

  afterAll(async () => {
    await db.close()
    // Clean up test database
    try {
      rmSync(TEST_DB_PATH, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  describe('Database Schema', () => {
    test('reports table exists and works', async () => {
      const vcs = db.getVCSManager(executionId)

      const reportId = await vcs.addReport({
        type: 'progress',
        title: 'Test Report',
        content: 'This is a test report',
        severity: 'info',
        data: { test: true },
      })

      expect(reportId).toBeTruthy()

      const reports = await vcs.getReports()
      expect(reports.length).toBeGreaterThan(0)
      expect(reports[0].title).toBe('Test Report')
      expect(reports[0].type).toBe('progress')
    })

    test('commits table exists and works', async () => {
      const vcs = db.getVCSManager(executionId)

      const commitId = await vcs.logCommit({
        vcs_type: 'jj',
        commit_hash: 'abc123def456',
        change_id: 'xyz789',
        message: 'Test commit',
        files_changed: ['file1.ts', 'file2.ts'],
        insertions: 10,
        deletions: 5,
        smithers_metadata: { test: true },
      })

      expect(commitId).toBeTruthy()

      const commits = await vcs.getCommits()
      expect(commits.length).toBeGreaterThan(0)
      expect(commits[0].message).toBe('Test commit')
      expect(commits[0].vcs_type).toBe('jj')
    })

    test('snapshots table exists and works', async () => {
      const vcs = db.getVCSManager(executionId)

      const snapshotId = await vcs.logSnapshot({
        change_id: 'snapshot123',
        commit_hash: 'commit456',
        description: 'Test snapshot',
        files_modified: ['mod1.ts'],
        files_added: ['add1.ts'],
        files_deleted: ['del1.ts'],
        has_conflicts: false,
      })

      expect(snapshotId).toBeTruthy()

      const snapshots = await vcs.getSnapshots()
      expect(snapshots.length).toBeGreaterThan(0)
      expect(snapshots[0].description).toBe('Test snapshot')
    })

    test('reviews table exists and works', async () => {
      const vcs = db.getVCSManager(executionId)

      const reviewId = await vcs.logReview({
        target_type: 'commit',
        target_ref: 'HEAD',
        approved: true,
        summary: 'Looks good!',
        issues: [],
        approvals: [{ aspect: 'code quality', reason: 'Well structured' }],
        reviewer_model: 'claude-sonnet-4',
        blocking: false,
        posted_to_github: false,
        posted_to_git_notes: true,
      })

      expect(reviewId).toBeTruthy()

      const reviews = await vcs.getReviews()
      expect(reviews.length).toBeGreaterThan(0)
      expect(reviews[0].approved).toBe(true)
    })

    test('steps table exists and works', async () => {
      const stepId = await db.steps.start('test-step')
      expect(stepId).toBeTruthy()

      await db.steps.complete(stepId)

      const steps = await db.steps.getByExecution(executionId)
      expect(steps.length).toBeGreaterThan(0)
      expect(steps[0].name).toBe('test-step')
      expect(steps[0].status).toBe('completed')
    })
  })

  describe('VCSManager', () => {
    test('getBlockingReviews returns only blocking reviews', async () => {
      const vcs = db.getVCSManager(executionId)

      // Add a non-blocking review
      await vcs.logReview({
        target_type: 'diff',
        target_ref: 'main',
        approved: false,
        summary: 'Non-blocking issues',
        issues: [{ severity: 'minor', message: 'Minor issue' }],
        blocking: false,
        posted_to_github: false,
        posted_to_git_notes: false,
      })

      // Add a blocking review
      await vcs.logReview({
        target_type: 'diff',
        target_ref: 'main',
        approved: false,
        summary: 'Critical issues',
        issues: [{ severity: 'critical', message: 'Security vulnerability' }],
        blocking: true,
        posted_to_github: false,
        posted_to_git_notes: false,
      })

      const blockingReviews = await vcs.getBlockingReviews()
      expect(blockingReviews.every((r) => r.blocking)).toBe(true)
    })

    test('getReports filters by type', async () => {
      const vcs = db.getVCSManager(executionId)

      await vcs.addReport({
        type: 'error',
        title: 'Error Report',
        content: 'Something went wrong',
        severity: 'critical',
      })

      await vcs.addReport({
        type: 'metric',
        title: 'Performance Metric',
        content: 'Response time: 100ms',
        severity: 'info',
      })

      const errorReports = await vcs.getReports('error')
      expect(errorReports.every((r) => r.type === 'error')).toBe(true)

      const metricReports = await vcs.getReports('metric')
      expect(metricReports.every((r) => r.type === 'metric')).toBe(true)
    })
  })

  describe('State Management', () => {
    test('state get/set works correctly', async () => {
      await db.state.set('test_key', 'test_value', 'test_trigger')

      const value = await db.state.get<string>('test_key')
      expect(value).toBe('test_value')
    })

    test('state getAll returns all state', async () => {
      await db.state.set('key1', 'value1', 'trigger1')
      await db.state.set('key2', { nested: true }, 'trigger2')

      const allState = await db.state.getAll()
      expect(allState).toBeTruthy()
      expect(allState.key1).toBe('value1')
      expect(allState.key2).toEqual({ nested: true })
    })
  })

  describe('Execution Management', () => {
    test('execution lifecycle works', async () => {
      const newExecutionId = await db.execution.start('Lifecycle Test', 'test.tsx')
      expect(newExecutionId).toBeTruthy()

      const execution = await db.execution.get(newExecutionId)
      expect(execution).toBeTruthy()
      expect(execution?.name).toBe('Lifecycle Test')
      expect(execution?.status).toBe('running')

      await db.execution.complete(newExecutionId, { result: 'success' })

      const completedExecution = await db.execution.get(newExecutionId)
      expect(completedExecution?.status).toBe('completed')
    })
  })
})

describe('Component Imports', () => {
  // Skip tests that import Solid JSX components due to transform mismatch
  test.skip('SmithersProvider exports correctly', async () => {})
  test.skip('Orchestration exports correctly', async () => {})
  test.skip('Phase exports correctly', async () => {})
  test.skip('Step exports correctly', async () => {})
  test.skip('Claude exports correctly', async () => {})

  test('Agent types export correctly', async () => {
    const types = await import('./components/agents/types')
    expect(types).toBeDefined()
  })

  test('Tools registry exports correctly', async () => {
    const { BUILTIN_TOOLS, isBuiltinTool } = await import('./tools/registry')
    expect(BUILTIN_TOOLS).toBeDefined()
    expect(isBuiltinTool).toBeDefined()
    expect(isBuiltinTool('Read')).toBe(true)
    expect(isBuiltinTool('NotATool')).toBe(false)
  })

  test('ReportTool exports correctly', async () => {
    const { createReportTool } = await import('./tools/ReportTool')
    expect(createReportTool).toBeDefined()
  })
})

// VCS Component Imports are skipped due to Solid JSX transform mismatch.
// These components use Solid internally which requires a different JSX transform
// than what's available in the test environment.
describe.skip('VCS Component Imports', () => {
  test('JJ components export correctly', async () => {})
  test('Git components export correctly', async () => {})
  test('Review component exports correctly', async () => {})
  test('Hook components export correctly', async () => {})
})

describe('VCS Utilities', () => {
  test('VCS utilities export correctly', async () => {
    const vcs = await import('../../src/utils/vcs')
    expect(vcs.git).toBeDefined()
    expect(vcs.jj).toBeDefined()
    expect(vcs.getCommitHash).toBeDefined()
    expect(vcs.getCommitInfo).toBeDefined()
    expect(vcs.getDiffStats).toBeDefined()
    expect(vcs.addGitNotes).toBeDefined()
    expect(vcs.getGitNotes).toBeDefined()
    expect(vcs.getJJChangeId).toBeDefined()
    expect(vcs.jjSnapshot).toBeDefined()
    expect(vcs.jjCommit).toBeDefined()
    expect(vcs.parseGitStatus).toBeDefined()
    expect(vcs.parseJJStatus).toBeDefined()
    expect(vcs.parseDiffStats).toBeDefined()
  })

  test('parseGitStatus works correctly', async () => {
    const { parseGitStatus } = await import('../../src/utils/vcs')

    const output = `M  src/file1.ts
A  src/file2.ts
D  src/file3.ts
?? src/file4.ts`

    const result = parseGitStatus(output)
    expect(result.modified).toContain('src/file1.ts')
    expect(result.added).toContain('src/file2.ts')
    expect(result.deleted).toContain('src/file3.ts')
  })

  test('parseDiffStats works correctly', async () => {
    const { parseDiffStats } = await import('../../src/utils/vcs')

    // parseDiffStats parses individual file change lines, not the summary
    const output = ` src/file1.ts | 10 ++++++----
 src/file2.ts | 5 +++++
 src/file3.ts | 3 ---`
    const result = parseDiffStats(output)

    expect(result.files.length).toBe(3)
    expect(result.files).toContain('src/file1.ts')
    expect(result.insertions).toBe(11) // 6+5+0 = 11 +'s
    expect(result.deletions).toBe(7) // 4+0+3 = 7 -'s
  })
})
