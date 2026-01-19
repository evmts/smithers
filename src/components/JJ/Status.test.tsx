/**
 * Comprehensive tests for JJ/Status.tsx
 * Tests component rendering, dirty/clean detection, callbacks, and task tracking
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

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-jj-status', 'test.tsx')

    getJJStatusSpy = spyOn(vcs, 'getJJStatus').mockResolvedValue({
      modified: ['src/file.ts'],
      added: [],
      deleted: [],
    })
  })

  afterEach(async () => {
    getJJStatusSpy.mockRestore()
    await new Promise((r) => setTimeout(r, 10))
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

    await new Promise((r) => setTimeout(r, 100))

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

  test('registers task with Ralph', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Status />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const tasks = db.query<{ component_type: string }>(
      'SELECT component_type FROM tasks'
    )
    const statusTask = tasks.find((t) => t.component_type === 'jj-status')
    expect(statusTask).toBeDefined()

    root.dispose()
  })
})

describe('Status dirty detection', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-jj-status-dirty', 'test.tsx')
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 10))
    db.close()
  })

  test('calls onDirty with modified files', async () => {
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

    await new Promise((r) => setTimeout(r, 200))

    expect(onDirty).toHaveBeenCalled()
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.modified).toContain('src/file1.ts')
    expect(status.modified).toContain('src/file2.ts')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('calls onDirty with added files', async () => {
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

    await new Promise((r) => setTimeout(r, 200))

    expect(onDirty).toHaveBeenCalled()
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.added).toContain('src/new-file.ts')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('calls onDirty with deleted files', async () => {
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

    await new Promise((r) => setTimeout(r, 200))

    expect(onDirty).toHaveBeenCalled()
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.deleted).toContain('src/removed-file.ts')

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})

describe('Status clean detection', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-jj-status-clean', 'test.tsx')
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 10))
    db.close()
  })

  test('calls onClean when no changes', async () => {
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

    await new Promise((r) => setTimeout(r, 200))

    expect(onClean).toHaveBeenCalled()
    expect(onDirty).not.toHaveBeenCalled()

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

})

describe('Status callbacks', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-jj-status-callbacks', 'test.tsx')
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 10))
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

    await new Promise((r) => setTimeout(r, 200))

    expect(onDirty).toHaveBeenCalledTimes(1)
    const status = onDirty.mock.calls[0]?.[0] as { modified: string[]; added: string[]; deleted: string[] }
    expect(status.modified).toHaveLength(2)
    expect(status.added).toHaveLength(1)
    expect(status.deleted).toHaveLength(3)

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('only onDirty called when dirty', async () => {
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

    await new Promise((r) => setTimeout(r, 200))

    expect(onDirty).toHaveBeenCalled()
    expect(onClean).not.toHaveBeenCalled()

    getJJStatusSpy.mockRestore()
    root.dispose()
  })

  test('only onClean called when clean', async () => {
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

    await new Promise((r) => setTimeout(r, 200))

    expect(onClean).toHaveBeenCalled()
    expect(onDirty).not.toHaveBeenCalled()

    getJJStatusSpy.mockRestore()
    root.dispose()
  })
})
