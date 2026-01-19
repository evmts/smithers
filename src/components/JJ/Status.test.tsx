/**
 * Comprehensive tests for JJ/Status.tsx
 * Tests component rendering, dirty/clean detection, callbacks, lifecycle, error handling
 */
import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import type { StatusProps } from './Status.js'
import { createSmithersRoot } from '../../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { SmithersProvider } from '../SmithersProvider.js'
import { Status } from './Status.js'
import * as vcs from '../../utils/vcs.js'

describe('StatusProps interface', () => {
  test('onDirty is optional callback', () => {
    const callback = mock(() => {})
    const props: StatusProps = { onDirty: callback }

    const status = {
      modified: ['file1.ts'],
      added: ['file2.ts'],
      deleted: [],
    }

    props.onDirty?.(status)
    expect(callback).toHaveBeenCalledWith(status)
  })

  test('onClean is optional callback', () => {
    const callback = mock(() => {})
    const props: StatusProps = { onClean: callback }

    props.onClean?.()
    expect(callback).toHaveBeenCalled()
  })

  test('children is optional', () => {
    const props: StatusProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const onDirty = mock(() => {})
    const onClean = mock(() => {})

    const props: StatusProps = { onDirty, onClean }

    expect(props.onDirty).toBeDefined()
    expect(props.onClean).toBeDefined()
  })
})

describe('Status component rendering', () => {
  let db: SmithersDB
  let executionId: string
  let getJJStatusSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })

    // Mock VCS functions
    getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['src/file.ts'],
      added: [],
      deleted: [],
    })
  })

  afterEach(() => {
    getJJStatusSpy.mockRestore()
    db.close()
  })

  test('renders jj-status element', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<jj-status')
    root.dispose()
  })

  test('calls getJJStatus on mount', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    expect(getJJStatusSpy).toHaveBeenCalled()
    root.dispose()
  })

  test('renders children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status>
          <step>Child step</step>
        </Status>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<step>')
    expect(xml).toContain('Child step')
    root.dispose()
  })
})

describe('Status dirty detection', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('detects dirty state with modified files', async () => {
    const onDirty = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['src/file1.ts', 'src/file2.ts'],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onDirty).toHaveBeenCalled()
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.modified).toContain('src/file1.ts')
    expect(status.modified).toContain('src/file2.ts')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('detects dirty state with added files', async () => {
    const onDirty = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: ['src/new-file.ts'],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onDirty).toHaveBeenCalled()
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.added).toContain('src/new-file.ts')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('detects dirty state with deleted files', async () => {
    const onDirty = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: ['src/removed-file.ts'],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onDirty).toHaveBeenCalled()
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.deleted).toContain('src/removed-file.ts')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('detects dirty with mixed changes', async () => {
    const onDirty = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['mod.ts'],
      added: ['add.ts'],
      deleted: ['del.ts'],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onDirty).toHaveBeenCalled()
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.modified).toHaveLength(1)
    expect(status.added).toHaveLength(1)
    expect(status.deleted).toHaveLength(1)

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('renders is-dirty attribute as true when dirty', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['file.ts'],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('is-dirty="true"')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Status clean detection', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('detects clean state when no changes', async () => {
    const onClean = mock(() => {})
    const onDirty = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onClean={onClean} onDirty={onDirty} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onClean).toHaveBeenCalled()
    expect(onDirty).not.toHaveBeenCalled()

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('renders is-dirty attribute as false when clean', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('is-dirty="false"')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('does not call onDirty when clean', async () => {
    const onDirty = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onDirty).not.toHaveBeenCalled()

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Status callbacks', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('onDirty receives complete status object', async () => {
    const onDirty = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['m1.ts', 'm2.ts'],
      added: ['a1.ts'],
      deleted: ['d1.ts', 'd2.ts', 'd3.ts'],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onDirty).toHaveBeenCalledTimes(1)
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.modified).toHaveLength(2)
    expect(status.added).toHaveLength(1)
    expect(status.deleted).toHaveLength(3)

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('only onDirty is called when dirty (not onClean)', async () => {
    const onDirty = mock(() => {})
    const onClean = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['file.ts'],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} onClean={onClean} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onDirty).toHaveBeenCalled()
    expect(onClean).not.toHaveBeenCalled()

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('only onClean is called when clean (not onDirty)', async () => {
    const onDirty = mock(() => {})
    const onClean = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} onClean={onClean} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onClean).toHaveBeenCalled()
    expect(onDirty).not.toHaveBeenCalled()

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('callbacks are optional and no error when not provided', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['file.ts'],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    
    // Should not throw even without callbacks
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="complete"')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Status status transitions', () => {
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
    let resolveStatus: () => void
    const statusPromise = new Promise<void>((r) => {
      resolveStatus = r
    })

    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockImplementation(async () => {
      await statusPromise
      return { modified: [], added: [], deleted: [] }
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    // Initially pending then running
    let xml = root.toXML()
    expect(xml).toMatch(/status="(pending|running)"/)

    // Complete the status check
    resolveStatus!()
    await new Promise((r) => setTimeout(r, 100))

    xml = root.toXML()
    expect(xml).toContain('status="complete"')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('transitions to error status on failure', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockRejectedValue(
      new Error('jj: not a jujutsu repository')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('not a jujutsu repository')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Status error handling', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('handles getJJStatus throwing Error', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockRejectedValue(
      new Error('Repository not found')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('Repository not found')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('handles non-Error thrown values', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockRejectedValue('string error')

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('string error')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('does not call callbacks on error', async () => {
    const onDirty = mock(() => {})
    const onClean = mock(() => {})
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockRejectedValue(
      new Error('Failed')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status onDirty={onDirty} onClean={onClean} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(onDirty).not.toHaveBeenCalled()
    expect(onClean).not.toHaveBeenCalled()

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Status reporting', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('adds report to VCS database when dirty', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['file1.ts', 'file2.ts'],
      added: ['new.ts'],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const reports = db.query<{ title: string; content: string }>(
      'SELECT title, content FROM reports'
    )
    const statusReport = reports.find((r) => r.title === 'JJ Status Check')
    expect(statusReport).toBeDefined()
    expect(statusReport?.content).toContain('dirty')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('adds report to VCS database when clean', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const reports = db.query<{ title: string; content: string }>(
      'SELECT title, content FROM reports'
    )
    const statusReport = reports.find((r) => r.title === 'JJ Status Check')
    expect(statusReport).toBeDefined()
    expect(statusReport?.content).toContain('clean')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('report includes file counts', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['m1.ts', 'm2.ts'],
      added: ['a1.ts'],
      deleted: ['d1.ts'],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const reports = db.query<{ content: string }>(
      "SELECT content FROM reports WHERE title = 'JJ Status Check'"
    )
    expect(reports.length).toBeGreaterThan(0)
    expect(reports[0]?.content).toContain('2 modified')
    expect(reports[0]?.content).toContain('1 added')
    expect(reports[0]?.content).toContain('1 deleted')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Status task tracking', () => {
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
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    // Check that a task was started
    await new Promise((r) => setTimeout(r, 50))

    const tasks = db.query<{ type: string; status: string }>(
      'SELECT type, status FROM tasks'
    )
    const statusTask = tasks.find((t) => t.type === 'jj-status')
    expect(statusTask).toBeDefined()

    // Wait for completion
    await new Promise((r) => setTimeout(r, 100))

    const completedTasks = db.query<{ type: string; status: string }>(
      "SELECT type, status FROM tasks WHERE type = 'jj-status'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('completes task even on error', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockRejectedValue(
      new Error('Status check failed')
    )

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const completedTasks = db.query<{ type: string; status: string }>(
      "SELECT type, status FROM tasks WHERE type = 'jj-status'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Status rendered attributes', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
  })

  afterEach(() => {
    db.close()
  })

  test('renders modified files as comma-separated list', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['a.ts', 'b.ts', 'c.ts'],
      added: [],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('modified="a.ts,b.ts,c.ts"')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('renders added files as comma-separated list', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: ['new1.ts', 'new2.ts'],
      deleted: [],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('added="new1.ts,new2.ts"')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('renders deleted files as comma-separated list', async () => {
    const getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: [],
      added: [],
      deleted: ['old1.ts', 'old2.ts'],
    })

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('deleted="old1.ts,old2.ts"')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})
