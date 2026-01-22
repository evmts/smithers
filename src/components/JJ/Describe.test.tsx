/**
 * Comprehensive tests for JJ/Describe.tsx
 * Tests component rendering and props interface
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import type { DescribeProps } from './Describe.js'
import { createSmithersRoot } from '../../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { SmithersProvider } from '../SmithersProvider.js'
import { Describe } from './Describe.js'

describe('DescribeProps interface', () => {
  test('does NOT have deprecated changeId/description props', () => {
    // Verify the old API (changeId, description) is not present
    // The new API uses useAgent/template for AI-assisted description generation
    const props: DescribeProps = {
      useAgent: 'claude',
      template: 'conventional-commits',
    }
    // These would be TypeScript errors if they existed:
    // @ts-expect-error - changeId is not a valid prop
    expect((props as { changeId?: string }).changeId).toBeUndefined()
    // @ts-expect-error - description is not a valid prop
    expect((props as { description?: string }).description).toBeUndefined()
  })

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

  test('id prop is optional', () => {
    const props: DescribeProps = { id: 'custom-id' }
    expect(props.id).toBe('custom-id')
  })
})

describe('Describe component rendering', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-jj-describe', 'test.tsx')
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 10))
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

  test('registers task with Ralph', async () => {
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Describe />
      </SmithersProvider>
    )

    await new Promise((r) => setTimeout(r, 50))

    const tasks = db.query<{ component_type: string }>(
      'SELECT component_type FROM tasks'
    )
    const describeTask = tasks.find((t) => t.component_type === 'jj-describe')
    expect(describeTask).toBeDefined()

    root.dispose()
  })
})
