/**
 * Comprehensive tests for JJ/Snapshot.tsx
 * Tests component rendering, VCS function calls, and task tracking
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

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-jj-snapshot', 'test.tsx')

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

  afterEach(async () => {
    jjSnapshotSpy.mockRestore()
    getJJStatusSpy.mockRestore()
    await new Promise((r) => setTimeout(r, 10))
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

  test('calls jjSnapshot with message', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot message="Pre-refactor snapshot" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(jjSnapshotSpy).toHaveBeenCalledWith('Pre-refactor snapshot')
    root.dispose()
  })

  test('calls jjSnapshot without message', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(jjSnapshotSpy).toHaveBeenCalledWith(undefined)
    root.dispose()
  })

  test('calls getJJStatus after snapshot', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 200))

    expect(getJJStatusSpy).toHaveBeenCalled()
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

  test('registers task with Ralph', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const tasks = db.query<{ component_type: string }>(
      'SELECT component_type FROM tasks'
    )
    const snapshotTask = tasks.find((t) => t.component_type === 'jj-snapshot')
    expect(snapshotTask).toBeDefined()

    root.dispose()
  })

  test('completes task after operation', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Snapshot />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 300))

    const completedTasks = db.query<{ component_type: string; status: string }>(
      "SELECT component_type, status FROM tasks WHERE component_type = 'jj-snapshot'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    root.dispose()
  })
})
