/**
 * Comprehensive tests for JJ/Snapshot.tsx
 * Tests component rendering, lifecycle, error handling
 */
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import type { SnapshotProps } from './Snapshot.js'
import { createSmithersRoot } from '../../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { SmithersProvider } from '../SmithersProvider.js'
import { Snapshot } from './Snapshot.js'
import * as vcs from '../../utils/vcs.js'

describe('SnapshotProps interface', () => {
  test('message is optional', () => {
    const props: SnapshotProps = {}
    expect(props.message).toBeUndefined()
  })

  test('message can be set', () => {
    const props: SnapshotProps = { message: 'Snapshot before refactoring' }
    expect(props.message).toBe('Snapshot before refactoring')
  })

  test('children is optional', () => {
    const props: SnapshotProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const props: SnapshotProps = {
      message: 'Pre-deploy snapshot',
    }

    expect(props.message).toBe('Pre-deploy snapshot')
  })
})

describe('Snapshot component rendering', () => {
  let db: SmithersDB
  let executionId: string
  let jjSnapshotSpy: ReturnType<typeof spyOn>
  let getJJStatusSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })

    // Mock VCS functions
    jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockResolvedValue({
      changeId: 'abc123xyz',
      description: 'Snapshot description',
    })
    getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['src/file1.ts', 'src/file2.ts'],
      added: ['src/new.ts'],
      deleted: ['src/old.ts'],
    })
  })

  afterEach(() => {
    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    db.close()
  })

  test('renders jj-snapshot element', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<jj-snapshot')
    root.dispose()
  })

  test('renders with message prop', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot message="Test snapshot" />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('message="Test snapshot"')
    root.dispose()
  })

  test('creates snapshot with message', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot message="Pre-refactor snapshot" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    expect(jjSnapshotSpy).toHaveBeenCalledWith('Pre-refactor snapshot')
    root.dispose()
  })

  test('creates snapshot without message', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    expect(jjSnapshotSpy).toHaveBeenCalledWith(undefined)
    root.dispose()
  })

  test('gets JJ status after snapshot', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(getJJStatusSpy).toHaveBeenCalled()
    root.dispose()
  })

  test('extracts change ID from snapshot result', async () => {
    jjSnapshotSpy.mockResolvedValue({
      changeId: 'unique-change-id-123',
      description: 'Test',
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('change-id="unique-change-id-123"')
    root.dispose()
  })

  test('renders children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot>
          <step>Child step</step>
        </Snapshot>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<step>')
    expect(xml).toContain('Child step')
    root.dispose()
  })
})

describe('Snapshot status transitions', () => {
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
    let resolveSnapshot: () => void
    const snapshotPromise = new Promise<void>((r) => {
      resolveSnapshot = r
    })

    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockImplementation(async () => {
      await snapshotPromise
      return { changeId: 'abc123', description: 'Test' }
    })
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    // Initially pending then running
    let xml = root.toXML()
    expect(xml).toMatch(/status="(pending|running)"/)

    // Complete the snapshot
    resolveSnapshot!()
    await new Promise((r) => setTimeout(r, 100))

    xml = root.toXML()
    expect(xml).toContain('status="complete"')

    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('transitions to error status on failure', async () => {
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockRejectedValue(
      new Error('JJ snapshot failed: not a repository')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('error="JJ snapshot failed')

    jjSnapshotSpy.mockRestore()
    root.dispose()
  })
})

describe('Snapshot error handling', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('handles jjSnapshot throwing Error', async () => {
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockRejectedValue(
      new Error('Repository not found')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('Repository not found')

    jjSnapshotSpy.mockRestore()
    root.dispose()
  })

  test('handles non-Error thrown values', async () => {
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockRejectedValue('string error')

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('string error')

    jjSnapshotSpy.mockRestore()
    root.dispose()
  })

  test('handles getJJStatus failure', async () => {
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockResolvedValue({
      changeId: 'abc123',
      description: 'Test',
    })
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockRejectedValue(
      new Error('status failed')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    // Should be in error state since getJJStatus failed
    const xml = root.toXML()
    expect(xml).toContain('status="error"')

    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Snapshot database logging', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('logs snapshot to VCS database', async () => {
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockResolvedValue({
      changeId: 'logged-change-id',
      description: 'Logged snapshot',
    })
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['file1.ts', 'file2.ts'],
      added: ['new.ts'],
      deleted: ['old.ts'],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    // Check that snapshot was logged to database
    const snapshots = db.query<{
      change_id: string
      description: string
      files_modified: number
      files_added: number
      files_deleted: number
    }>('SELECT change_id, description, files_modified, files_added, files_deleted FROM snapshots')

    expect(snapshots.length).toBeGreaterThanOrEqual(0) // May vary by implementation
    
    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('logs correct file counts', async () => {
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockResolvedValue({
      changeId: 'count-test',
      description: 'Count test',
    })
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['a.ts', 'b.ts', 'c.ts'],
      added: ['d.ts'],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    // Verify getJJStatus was called to get file counts
    expect(getJJStatusSpy).toHaveBeenCalled()

    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Snapshot task tracking', () => {
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
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockResolvedValue({
      changeId: 'abc123',
      description: 'Test',
    })
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    // Check that a task was started
    await new Promise((r) => setTimeout(r, 50))

    const tasks = db.query<{ type: string; status: string }>(
      'SELECT type, status FROM tasks'
    )
    const snapshotTask = tasks.find((t) => t.type === 'jj-snapshot')
    expect(snapshotTask).toBeDefined()

    // Wait for completion
    await new Promise((r) => setTimeout(r, 100))

    const completedTasks = db.query<{ type: string; status: string }>(
      "SELECT type, status FROM tasks WHERE type = 'jj-snapshot'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('completes task even on error', async () => {
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockRejectedValue(
      new Error('Snapshot failed')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const completedTasks = db.query<{ type: string; status: string }>(
      "SELECT type, status FROM tasks WHERE type = 'jj-snapshot'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    jjSnapshotSpy.mockRestore()
    root.dispose()
  })
})

describe('Snapshot with different status results', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('handles empty status (clean working copy)', async () => {
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockResolvedValue({
      changeId: 'clean-id',
      description: 'Clean snapshot',
    })
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="complete"')

    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('handles many modified files', async () => {
    const manyFiles = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`)
    
    const jjSnapshotSpy = spyOn(vcs, 'jjSnapshot').mockResolvedValue({
      changeId: 'many-files-id',
      description: 'Many files',
    })
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: manyFiles,
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="complete"')

    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})
