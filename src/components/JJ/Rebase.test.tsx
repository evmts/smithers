/**
 * Comprehensive tests for JJ/Rebase.tsx
 * Tests component rendering, conflict parsing, lifecycle, error handling
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
  let originalBun$: typeof Bun.$
  let mockBun$Calls: string[]

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
    mockBun$Calls = []

    // Mock Bun.$ for jj commands
    originalBun$ = Bun.$
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        mockBun$Calls.push(cmd)

        if (cmd.includes('jj') && cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('Rebased 1 commits'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('Working copy changes:\nM src/file.ts'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }
  })

  afterEach(() => {
    ;(globalThis as any).Bun = { ...Bun, $: originalBun$ }
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

  test('executes jj rebase with destination flag', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(mockBun$Calls.some((cmd) => cmd.includes('rebase') && cmd.includes('-d'))).toBe(true)
    root.dispose()
  })

  test('executes jj rebase with source flag', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase source="feature" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(mockBun$Calls.some((cmd) => cmd.includes('rebase') && cmd.includes('-s'))).toBe(true)
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
})

describe('Rebase conflict parsing', () => {
  let db: SmithersDB
  let executionId: string
  let originalBun$: typeof Bun.$

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
    originalBun$ = Bun.$
  })

  afterEach(() => {
    ;(globalThis as any).Bun = { ...Bun, $: originalBun$ }
    db.close()
  })

  test('parses conflicts from rebase output with C prefix', async () => {
    const onConflict = mock(() => {})

    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('C src/conflicting.ts\nC src/another.ts'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('C src/conflicting.ts\nC src/another.ts'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" onConflict={onConflict} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    expect(onConflict).toHaveBeenCalled()
    const conflicts = onConflict.mock.calls[0]?.[0] as string[]
    expect(conflicts).toContain('src/conflicting.ts')
    expect(conflicts).toContain('src/another.ts')

    root.dispose()
  })

  test('parses conflicts from output with quoted filenames', async () => {
    const onConflict = mock(() => {})

    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('conflict in \'src/file.ts\' and "src/other.ts"'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve(''),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" onConflict={onConflict} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    expect(onConflict).toHaveBeenCalled()

    root.dispose()
  })

  test('detects conflicts from jj status after rebase', async () => {
    const onConflict = mock(() => {})

    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('Rebased'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('C src/status-conflict.ts'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" onConflict={onConflict} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    expect(onConflict).toHaveBeenCalled()
    const conflicts = onConflict.mock.calls[0]?.[0] as string[]
    expect(conflicts).toContain('src/status-conflict.ts')

    root.dispose()
  })

  test('deduplicates conflicts from multiple sources', async () => {
    const onConflict = mock(() => {})

    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('C src/same.ts'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('C src/same.ts'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" onConflict={onConflict} />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    expect(onConflict).toHaveBeenCalled()
    const conflicts = onConflict.mock.calls[0]?.[0] as string[]
    // Should be deduplicated
    expect(conflicts.filter((c) => c === 'src/same.ts').length).toBe(1)

    root.dispose()
  })
})

describe('Rebase status transitions', () => {
  let db: SmithersDB
  let executionId: string
  let originalBun$: typeof Bun.$

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
    originalBun$ = Bun.$
  })

  afterEach(() => {
    ;(globalThis as any).Bun = { ...Bun, $: originalBun$ }
    db.close()
  })

  test('transitions to complete on successful rebase', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('Rebased 1 commits'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('Working copy clean'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const xml = root.toXML()
    expect(xml).toContain('status="complete"')

    root.dispose()
  })

  test('transitions to conflict when conflicts detected', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('C src/conflict.ts'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('C src/conflict.ts'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const xml = root.toXML()
    expect(xml).toContain('status="conflict"')

    root.dispose()
  })

  test('transitions to conflict when rebase command fails with conflict', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          const error: any = new Error('Rebase failed')
          error.stderr = Buffer.from('conflict detected')
          return {
            quiet: () => Promise.reject(error),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('C src/conflict.ts'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const xml = root.toXML()
    expect(xml).toContain('status="conflict"')

    root.dispose()
  })

  test('transitions to error on non-conflict failure', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from(''),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.reject(new Error('jj status failed')),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')

    root.dispose()
  })
})

describe('Rebase error handling', () => {
  let db: SmithersDB
  let executionId: string
  let originalBun$: typeof Bun.$

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
    originalBun$ = Bun.$
  })

  afterEach(() => {
    ;(globalThis as any).Bun = { ...Bun, $: originalBun$ }
    db.close()
  })

  test('handles Error thrown from jj status', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from(''),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.reject(new Error('not a jj repository')),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('not a jj repository')

    root.dispose()
  })

  test('handles non-Error thrown values', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from(''),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.reject('string error'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')

    root.dispose()
  })
})

describe('Rebase reporting', () => {
  let db: SmithersDB
  let executionId: string
  let originalBun$: typeof Bun.$

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
    originalBun$ = Bun.$
  })

  afterEach(() => {
    ;(globalThis as any).Bun = { ...Bun, $: originalBun$ }
    db.close()
  })

  test('adds success report on successful rebase', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('Rebased'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('Working copy clean'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" source="feature" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const reports = db.query<{ title: string; type: string }>(
      'SELECT title, type FROM reports'
    )
    const rebaseReport = reports.find((r) => r.title === 'JJ Rebase Complete')
    expect(rebaseReport).toBeDefined()
    expect(rebaseReport?.type).toBe('progress')

    root.dispose()
  })

  test('adds warning report on conflict', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from('C file.ts'),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve('C file.ts'),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const reports = db.query<{ title: string; type: string; severity: string }>(
      'SELECT title, type, severity FROM reports'
    )
    const conflictReport = reports.find((r) => r.title === 'JJ Rebase Conflicts')
    expect(conflictReport).toBeDefined()
    expect(conflictReport?.type).toBe('warning')
    expect(conflictReport?.severity).toBe('warning')

    root.dispose()
  })

  test('adds error report on failure', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from(''),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.reject(new Error('fatal error')),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }

    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const reports = db.query<{ title: string; type: string; severity: string }>(
      'SELECT title, type, severity FROM reports'
    )
    const errorReport = reports.find((r) => r.title === 'JJ Rebase Failed')
    expect(errorReport).toBeDefined()
    expect(errorReport?.type).toBe('error')
    expect(errorReport?.severity).toBe('critical')

    root.dispose()
  })
})

describe('Rebase task tracking', () => {
  let db: SmithersDB
  let executionId: string
  let originalBun$: typeof Bun.$

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start({ trigger: 'test' })
    originalBun$ = Bun.$

    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('rebase')) {
          return {
            quiet: () =>
              Promise.resolve({
                stdout: Buffer.from(''),
                stderr: Buffer.from(''),
              }),
          }
        }
        if (cmd.includes('jj status')) {
          return {
            text: () => Promise.resolve(''),
          }
        }
        return originalBun$(strings, ...values)
      },
      originalBun$
    )
    ;(globalThis as any).Bun = { ...Bun, $: mockBun$ }
  })

  afterEach(() => {
    ;(globalThis as any).Bun = { ...Bun, $: originalBun$ }
    db.close()
  })

  test('registers and completes task', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Rebase destination="main" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const tasks = db.query<{ type: string; status: string }>(
      'SELECT type, status FROM tasks'
    )
    const rebaseTask = tasks.find((t) => t.type === 'jj-rebase')
    expect(rebaseTask).toBeDefined()

    await new Promise((r) => setTimeout(r, 150))

    const completedTasks = db.query<{ type: string; status: string }>(
      "SELECT type, status FROM tasks WHERE type = 'jj-rebase'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    root.dispose()
  })
})
