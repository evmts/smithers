/**
 * Comprehensive tests for JJ/Describe.tsx
 * Tests component rendering, lifecycle, error handling
 */
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import type { DescribeProps } from './Describe.js'
import { createSmithersRoot } from '../../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { SmithersProvider } from '../SmithersProvider.js'
import { Describe } from './Describe.js'

describe('DescribeProps interface', () => {
  test('useAgent is optional', () => {
    const props: DescribeProps = {}
    expect(props.useAgent).toBeUndefined()
  })

  test('useAgent can be claude', () => {
    const props: DescribeProps = { useAgent: 'claude' }
    expect(props.useAgent).toBe('claude')
  })

  test('template is optional string', () => {
    const props: DescribeProps = { template: 'feat: {summary}' }
    expect(props.template).toBe('feat: {summary}')
  })

  test('children is optional', () => {
    const props: DescribeProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const props: DescribeProps = {
      useAgent: 'claude',
      template: 'conventional-commits',
    }

    expect(props.useAgent).toBe('claude')
    expect(props.template).toBe('conventional-commits')
  })
})

describe('Describe component rendering', () => {
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

        if (cmd.includes('jj diff')) {
          return {
            text: () => Promise.resolve('+ added line\n- removed line\n  context'),
            quiet: () => Promise.resolve({ stdout: Buffer.from(''), stderr: Buffer.from('') }),
          }
        }
        if (cmd.includes('jj describe')) {
          return {
            quiet: () => Promise.resolve({ stdout: Buffer.from(''), stderr: Buffer.from('') }),
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

  test('renders jj-describe element', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<jj-describe')
    root.dispose()
  })

  test('renders with useAgent prop', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe useAgent="claude" />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('use-agent="claude"')
    root.dispose()
  })

  test('renders with template prop', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe template="conventional-commits" />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('template="conventional-commits"')
    root.dispose()
  })

  test('executes jj diff to get changes', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(mockBun$Calls.some((cmd) => cmd.includes('jj diff'))).toBe(true)
    root.dispose()
  })

  test('executes jj describe with generated message', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    expect(mockBun$Calls.some((cmd) => cmd.includes('jj describe'))).toBe(true)
    root.dispose()
  })

  test('renders children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe>
          <step>Child step</step>
        </Describe>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<step>')
    expect(xml).toContain('Child step')
    root.dispose()
  })
})

describe('Describe status transitions', () => {
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

  test('transitions from pending to running to complete on success', async () => {
    let resolveDiff: () => void
    const diffPromise = new Promise<void>((r) => {
      resolveDiff = r
    })

    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('jj diff')) {
          return {
            text: async () => {
              await diffPromise
              return 'line1\nline2\nline3'
            },
          }
        }
        if (cmd.includes('jj describe')) {
          return {
            quiet: () => Promise.resolve({ stdout: Buffer.from(''), stderr: Buffer.from('') }),
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
        <Describe />
      </SmithersProvider>
    )

    // Initially pending then running
    let xml = root.toXML()
    expect(xml).toMatch(/status="(pending|running)"/)

    // Complete the diff
    resolveDiff!()
    await new Promise((r) => setTimeout(r, 100))

    xml = root.toXML()
    expect(xml).toContain('status="complete"')

    root.dispose()
  })

  test('transitions to error status on failure', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('jj diff')) {
          return {
            text: () => Promise.reject(new Error('jj: not a jujutsu repository')),
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
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('not a jujutsu repository')

    root.dispose()
  })
})

describe('Describe error handling', () => {
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

  test('handles jj diff command failure', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('jj diff')) {
          return {
            text: () => Promise.reject(new Error('Command failed')),
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
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('error=')

    root.dispose()
  })

  test('handles jj describe command failure', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('jj diff')) {
          return {
            text: () => Promise.resolve('diff output'),
          }
        }
        if (cmd.includes('jj describe')) {
          return {
            quiet: () => Promise.reject(new Error('describe failed')),
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
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')

    root.dispose()
  })

  test('handles non-Error thrown values', async () => {
    const mockBun$ = Object.assign(
      (strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = String.raw({ raw: strings }, ...values)
        if (cmd.includes('jj diff')) {
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
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 100))

    const xml = root.toXML()
    expect(xml).toContain('status="error"')
    expect(xml).toContain('string error')

    root.dispose()
  })
})

describe('Describe reporting', () => {
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
        if (cmd.includes('jj diff')) {
          return {
            text: () => Promise.resolve('line1\nline2\nline3'),
          }
        }
        if (cmd.includes('jj describe')) {
          return {
            quiet: () => Promise.resolve({ stdout: Buffer.from(''), stderr: Buffer.from('') }),
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

  test('adds report to VCS database on success', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const reports = db.query<{ title: string; type: string }>(
      'SELECT title, type FROM reports'
    )
    const describeReport = reports.find((r) => r.title === 'JJ Describe')
    expect(describeReport).toBeDefined()
    expect(describeReport?.type).toBe('progress')

    root.dispose()
  })

  test('stores useAgent in report data', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe useAgent="claude" />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 150))

    const reports = db.query<{ title: string; data: string }>(
      'SELECT title, data FROM reports'
    )
    const describeReport = reports.find((r) => r.title === 'JJ Describe')
    if (describeReport?.data) {
      const data = JSON.parse(describeReport.data)
      expect(data.useAgent).toBe('claude')
    }

    root.dispose()
  })
})

describe('Describe task tracking', () => {
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
        if (cmd.includes('jj diff')) {
          return {
            text: () => Promise.resolve('diff output'),
          }
        }
        if (cmd.includes('jj describe')) {
          return {
            quiet: () => Promise.resolve({ stdout: Buffer.from(''), stderr: Buffer.from('') }),
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
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const tasks = db.query<{ type: string; status: string }>(
      'SELECT type, status FROM tasks'
    )
    const describeTask = tasks.find((t) => t.type === 'jj-describe')
    expect(describeTask).toBeDefined()

    await new Promise((r) => setTimeout(r, 100))

    const completedTasks = db.query<{ type: string; status: string }>(
      "SELECT type, status FROM tasks WHERE type = 'jj-describe'"
    )
    expect(completedTasks.some((t) => t.status === 'completed')).toBe(true)

    root.dispose()
  })
})
