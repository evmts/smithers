/**
 * Comprehensive tests for JJ/Commit.tsx
 * Tests component rendering, VCS function calls, and task tracking
 */
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
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

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-jj-commit', 'test.tsx')

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

  afterEach(async () => {
    // Wait for async operations to complete before restoring spies
    await new Promise((r) => setTimeout(r, 10))
    jjCommitSpy.mockRestore()
    getJJDiffStatsSpy.mockRestore()
    addGitNotesSpy.mockRestore()
    db.close()
  })

  test('renders jj-commit element', async () => {
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

  test('calls jjCommit with message prop', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Feature: add new capability" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

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

    await new Promise((r) => setTimeout(r, 100))

    expect(jjCommitSpy).toHaveBeenCalledWith('Commit by Smithers')
    root.dispose()
  })

  test('calls addGitNotes when notes prop is provided', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" notes="User prompt: fix bug" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 200))

    expect(addGitNotesSpy).toHaveBeenCalledWith('User prompt: fix bug')
    root.dispose()
  })

  test('does not call addGitNotes when notes prop is not provided', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 200))

    expect(addGitNotesSpy).not.toHaveBeenCalled()
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

  test('registers task with Ralph', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const tasks = db.query<{ component_type: string; status: string }>(
      'SELECT component_type, status FROM tasks'
    )
    const jjTask = tasks.find((t) => t.component_type === 'jj-commit')
    expect(jjTask).toBeDefined()

    root.dispose()
  })

  test('completes task after operation', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Commit message="Test" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 300))

    const completedTasks = db.query<{ component_type: string; status: string }>(
      "SELECT component_type, status FROM tasks WHERE component_type = 'jj-commit'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    root.dispose()
  })
})
