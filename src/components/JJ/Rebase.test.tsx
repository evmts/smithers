/**
 * Comprehensive tests for JJ/Rebase.tsx
 * Tests component rendering, props interface, and callbacks
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { RebaseProps } from './Rebase.js'
import { createSmithersRoot } from '../../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { SmithersProvider } from '../SmithersProvider.js'
import { Rebase } from './Rebase.js'

describe('RebaseProps interface', () => {
  test('destination is optional', () => {
    const props: RebaseProps = {}
    expect(props.destination).toBeUndefined()
  })

  test('destination can be set', () => {
    const props: RebaseProps = { destination: 'main' }
    expect(props.destination).toBe('main')
  })

  test('source is optional', () => {
    const props: RebaseProps = {}
    expect(props.source).toBeUndefined()
  })

  test('source can be set', () => {
    const props: RebaseProps = { source: 'feature-branch' }
    expect(props.source).toBe('feature-branch')
  })

  test('onConflict is optional callback', () => {
    const callback = mock(() => {})
    const props: RebaseProps = { onConflict: callback }

    const conflicts = ['file1.ts', 'file2.ts']
    props.onConflict?.(conflicts)

    expect(callback).toHaveBeenCalledWith(conflicts)
  })

  test('children is optional', () => {
    const props: RebaseProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const onConflict = mock(() => {})
    const props: RebaseProps = {
      destination: 'main',
      source: 'feature',
      onConflict,
    }

    expect(props.destination).toBe('main')
    expect(props.source).toBe('feature')
    expect(props.onConflict).toBeDefined()
  })
})

describe('Rebase component rendering', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-jj-rebase', 'test.tsx')
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 10))
    db.close()
  })

  test('renders jj-rebase element', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<jj-rebase')
    root.dispose()
  })

  test('renders with destination prop', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('destination="main"')
    root.dispose()
  })

  test('renders with source prop', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase source="feature" />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('source="feature"')
    root.dispose()
  })

  test('renders with both destination and source', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" source="feature" />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('destination="main"')
    expect(xml).toContain('source="feature"')
    root.dispose()
  })

  test('renders children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main">
          <step>Rebase step</step>
        </Rebase>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<step>')
    expect(xml).toContain('Rebase step')
    root.dispose()
  })

  test('registers task with Ralph', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const tasks = db.query<{ component_type: string }>(
      'SELECT component_type FROM tasks'
    )
    const rebaseTask = tasks.find((t) => t.component_type === 'jj-rebase')
    expect(rebaseTask).toBeDefined()

    root.dispose()
  })
})

describe('Rebase onConflict callback', () => {
  test('callback receives array of conflict files', () => {
    const onConflict = mock((conflicts: string[]) => {
      expect(Array.isArray(conflicts)).toBe(true)
    })
    
    onConflict(['file1.ts', 'file2.ts'])
    expect(onConflict).toHaveBeenCalledWith(['file1.ts', 'file2.ts'])
  })

  test('callback can handle empty conflicts array', () => {
    const onConflict = mock(() => {})
    onConflict([])
    expect(onConflict).toHaveBeenCalledWith([])
  })

  test('callback can handle many conflicts', () => {
    const conflicts = Array.from({ length: 50 }, (_, i) => `file${i}.ts`)
    const onConflict = mock(() => {})
    onConflict(conflicts)
    expect(onConflict).toHaveBeenCalledWith(conflicts)
  })
})
