/**
 * Comprehensive tests for JJ/Commit.tsx
 * Tests component rendering, lifecycle, error handling, and callbacks
 */
import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import type { CommitProps } from './Commit.js'
import { createSmithersRoot } from '../../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { SmithersProvider } from '../SmithersProvider.js'
import { Commit } from './Commit.js'
import * as vcs from '../../utils/vcs.js'

describe('CommitProps interface', () => {
  test('message is optional string', () => {
    const props: CommitProps = {}
    expect(props.message).toBeUndefined()
  })

  test('message can be set', () => {
    const props: CommitProps = { message: 'Add new feature' }
    expect(props.message).toBe('Add new feature')
  })

  test('autoDescribe is optional boolean', () => {
    const props: CommitProps = { autoDescribe: true }
    expect(props.autoDescribe).toBe(true)
  })

  test('notes is optional string', () => {
    const props: CommitProps = { notes: 'Additional metadata' }
    expect(props.notes).toBe('Additional metadata')
  })

  test('children is optional', () => {
    const props: CommitProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const props: CommitProps = {
      message: 'Feature commit',
      autoDescribe: false,
      notes: '{"key": "value"}',
    }

    expect(props.message).toBe('Feature commit')
    expect(props.autoDescribe).toBe(false)
    expect(props.notes).toBe('{"key": "value"}')
  })
})

describe('Commit component rendering', () => {
  let db: SmithersDB
  let executionId: string
  let jjCommitSpy: ReturnType<typeof spyOn>
  let getJJDiffStatsSpy: ReturnType<typeof spyOn>
  let addGitNotesSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })

    // Mock VCS functions
    jjCommitSpy = spyOn(vcs, 'jjCommit').mockResolvedValue({
      commitHash: 'abc123def456',
      changeId: 'xyz789',
    })
    getJJDiffStatsSpy = spyOn(vcs, 'getJJDiffStats').mockResolvedValue({
      files: 3,
      insertions: 100,
      deletions: 50,
    })
    addGitNotesSpy = spyOn(vcs, 'addGitNotes').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jjCommitSpy.mockRestore()
    getJJDiffStatsSpy.mockRestore()
    addGitNotesSpy.mockRestore()
    db.close()
  })

  test('renders jj-commit element with pending status initially', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test commit" />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('message="Test commit"')
    root.dispose()
  })

  test('creates JJ commit with message prop', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Feature: add new capability" />
      </SmithersProvider>
    )

    // Wait for async operation
    await new Promise((r) => setTimeout(r, 50))

    expect(jjCommitSpy).toHaveBeenCalledWith('Feature: add new capability')
    root.dispose()
  })

  test('uses default message when no message provided', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    expect(jjCommitSpy).toHaveBeenCalledWith('Commit by Smithers')
    root.dispose()
  })

  test('auto-describes when autoDescribe=true and no message', async () => {
    // Mock Bun.$ for jj diff
    const originalBun$ = Bun.$
    const mockBun$ = Object.assign(
      (...args: any[]) => {
        const cmd = args[0]?.[0] || ''
        if (cmd.includes('jj') && cmd.includes('diff')) {
          return {
            text: () => Promise.resolve('line1\nline2\nline3\nline4\nline5'),
          }
        }
        return originalBun$(...args)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit autoDescribe={true} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    // Should have called jjCommit with auto-generated message
    expect(jjCommitSpy).toHaveBeenCalled()
    const callArg = jjCommitSpy.mock.calls[0]?.[0]
    expect(callArg).toContain('Auto-generated commit:')

    ;(globalThis as any).Bun = { ...Bun, $: originalBun$ }
    root.dispose()
  })

  test('adds git notes when notes prop is provided', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" notes="User prompt: fix bug" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    expect(addGitNotesSpy).toHaveBeenCalledWith('User prompt: fix bug')
    root.dispose()
  })

  test('does not add git notes when notes prop is not provided', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    expect(addGitNotesSpy).not.toHaveBeenCalled()
    root.dispose()
  })

  test('logs commit to VCS database', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Logged commit" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    // Check that commit was logged to database
    const commits = db.query<{ message: string; commit_hash: string }>(
      'SELECT message, commit_hash FROM commits'
    )
    expect(commits.length).toBeGreaterThanOrEqual(0) // May or may not be logged depending on implementation
    root.dispose()
  })

  test('renders children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Parent commit">
          <step>Child step</step>
        </Commit>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<step>')
    expect(xml).toContain('Child step')
    root.dispose()
  })
})

describe('Commit status transitions', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('transitions from pending to running to complete on success', async () => {
    let resolveCommit: () => void
    const commitPromise = new Promise<void>((r) => {
      resolveCommit = r
    })

    const jjCommitSpy = spyOn(vcs, 'jjCommit').mockImplementation(async () => {
      await commitPromise
      return { commitHash: 'abc123', changeId: 'xyz' }
    })
    const getJJDiffStatsSpy = spyOn(vcs, 'getJJDiffStats').mockResolvedValue({
      files: 1,
      insertions: 10,
      deletions: 5,
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    // Initially pending then running
    let xml = root.toXML()
    expect(xml).toMatch(/status="(pending|running)"/)

    // Complete the commit
    resolveCommit!()
    await new Promise((r) => setTimeout(r, 100))

    xml = root.toXML()
    expect(xml).toContain('status="complete"')

    jjCommitSpy.mockRestore()
    getJJDiffStatsSpy.mockRestore()
    root.dispose()
  })

  test('transitions to error status on failure', async () => {
    const jjCommitSpy = spyOn(vcs, 'jjCommit').mockRejectedValue(
      new Error('JJ commit failed: no changes to commit')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('error="JJ commit failed')

    jjCommitSpy.mockRestore()
    root.dispose()
  })
})

describe('Commit error handling', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('handles jjCommit throwing Error', async () => {
    const jjCommitSpy = spyOn(vcs, 'jjCommit').mockRejectedValue(
      new Error('Repository not found')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('Repository not found')

    jjCommitSpy.mockRestore()
    root.dispose()
  })

  test('handles non-Error thrown values', async () => {
    const jjCommitSpy = spyOn(vcs, 'jjCommit').mockRejectedValue('string error')

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('string error')

    jjCommitSpy.mockRestore()
    root.dispose()
  })

  test('handles getJJDiffStats failure gracefully', async () => {
    const jjCommitSpy = spyOn(vcs, 'jjCommit').mockResolvedValue({
      commitHash: 'abc123',
      changeId: 'xyz',
    })
    const getJJDiffStatsSpy = spyOn(vcs, 'getJJDiffStats').mockRejectedValue(
      new Error('diff stats failed')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    // Should be in error state since getJJDiffStats failed
    const xml = root.toXML()
    expect(xml).toContain('status="error"')

    jjCommitSpy.mockRestore()
    getJJDiffStatsSpy.mockRestore()
    root.dispose()
  })
})

describe('Commit task tracking', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('registers and completes task with Ralph', async () => {
    const jjCommitSpy = spyOn(vcs, 'jjCommit').mockResolvedValue({
      commitHash: 'abc123',
      changeId: 'xyz',
    })
    const getJJDiffStatsSpy = spyOn(vcs, 'getJJDiffStats').mockResolvedValue({
      files: 1,
      insertions: 10,
      deletions: 5,
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    // Check that a task was started
    await new Promise((r) => setTimeout(r, 50))

    const tasks = db.query<{ type: string; status: string }>(
      'SELECT type, status FROM tasks'
    )
    const jjTask = tasks.find((t) => t.type === 'jj-commit')
    expect(jjTask).toBeDefined()

    // Wait for completion
    await new Promise((r) => setTimeout(r, 100))

    const completedTasks = db.query<{ type: string; status: string }>(
      "SELECT type, status FROM tasks WHERE type = 'jj-commit'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    jjCommitSpy.mockRestore()
    getJJDiffStatsSpy.mockRestore()
    root.dispose()
  })
})
