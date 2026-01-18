/**
 * Unit tests for serialize.ts - SmithersNode to XML serialization.
 */
import { describe, test, expect } from 'bun:test'
import { serialize } from './serialize.js'
import type { SmithersNode } from './types.js'

function createNode(
  type: string,
  props: Record<string, unknown> = {},
  children: (SmithersNode | string)[] = []
): SmithersNode {
  const node: SmithersNode = {
    type,
    props,
    children: children.map(child => {
      if (typeof child === 'string') {
        return {
          type: 'TEXT',
          props: { value: child },
          children: [],
          parent: null,
        }
      }
      return child
    }),
    parent: null,
  }
  // Set parent references
  node.children.forEach(child => {
    child.parent = node
  })
  return node
}

describe('serialize', () => {
  test('serializes simple element as self-closing', () => {
    const node = createNode('phase', { name: 'test' })
    const xml = serialize(node)

    expect(xml).toBe('<phase name="test" />')
  })

  test('serializes element with text content', () => {
    const node = createNode('step', {}, ['Hello world'])
    const xml = serialize(node)

    expect(xml).toContain('<step>')
    expect(xml).toContain('Hello world')
    expect(xml).toContain('</step>')
  })

  test('serializes nested elements with indentation', () => {
    const child = createNode('step', {}, ['Do work'])
    const parent = createNode('phase', { name: 'main' }, [child])
    const xml = serialize(parent)

    expect(xml).toContain('<phase name="main">')
    expect(xml).toContain('</phase>')
    // Child should be indented
    expect(xml).toMatch(/\n\s+<step>/)
  })

  test('serializes ROOT node by serializing children only', () => {
    const child = createNode('phase', { name: 'test' })
    const root = createNode('ROOT', {}, [child])
    const xml = serialize(root)

    // ROOT should not appear in output
    expect(xml).not.toContain('ROOT')
    expect(xml).toBe('<phase name="test" />')
  })

  test('serializes multiple children separated by newlines', () => {
    const child1 = createNode('step', {}, ['Step 1'])
    const child2 = createNode('step', {}, ['Step 2'])
    const parent = createNode('phase', { name: 'multi' }, [child1, child2])
    const xml = serialize(parent)

    expect(xml).toContain('Step 1')
    expect(xml).toContain('Step 2')
  })

  test('serializes boolean props', () => {
    const node = createNode('task', { done: true, enabled: false })
    const xml = serialize(node)

    expect(xml).toContain('done="true"')
    expect(xml).toContain('enabled="false"')
  })

  test('serializes number props', () => {
    const node = createNode('ralph', { iteration: 5, maxIterations: 100 })
    const xml = serialize(node)

    expect(xml).toContain('iteration="5"')
    expect(xml).toContain('maxIterations="100"')
  })

  test('escapes special characters in text', () => {
    const node = createNode('step', {}, ['Use <tag> & "quotes"'])
    const xml = serialize(node)

    expect(xml).toContain('&lt;tag&gt;')
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&quot;')
  })

  test('escapes special characters in attribute values', () => {
    const node = createNode('persona', { role: 'expert "coder"' })
    const xml = serialize(node)

    expect(xml).toContain('role="expert &quot;coder&quot;"')
  })

  test('omits null and undefined props', () => {
    const node = createNode('phase', { name: 'test', data: null, other: undefined })
    const xml = serialize(node)

    expect(xml).toContain('name="test"')
    expect(xml).not.toContain('data=')
    expect(xml).not.toContain('other=')
  })

  test('serializes object props as JSON', () => {
    const node = createNode('step', { config: { key: 'value' } })
    const xml = serialize(node)

    expect(xml).toContain('config="')
    // JSON should be escaped
    expect(xml).toMatch(/&quot;key&quot;/)
  })

  test('serializes array props as JSON', () => {
    const node = createNode('phase', { tools: ['Read', 'Edit'] })
    const xml = serialize(node)

    expect(xml).toContain('tools="[')
  })

  test('handles node key attribute first', () => {
    const node = createNode('step', { name: 'test' })
    node.key = 'my-key'
    const xml = serialize(node)

    // Key should come before other attributes
    expect(xml).toMatch(/key="my-key".*name="test"/)
  })

  test('filters out callback props', () => {
    const callback = () => {}
    const node = createNode('step', {
      name: 'test',
      onFinished: callback,
      onError: callback,
      validate: callback,
    })
    const xml = serialize(node)

    expect(xml).toContain('name="test"')
    expect(xml).not.toContain('onFinished')
    expect(xml).not.toContain('onError')
    expect(xml).not.toContain('validate')
  })

  test('returns empty string for null node', () => {
    const xml = serialize(null as any)
    expect(xml).toBe('')
  })

  test('returns empty string for node without type', () => {
    const xml = serialize({ props: {}, children: [] } as any)
    expect(xml).toBe('')
  })

  test('handles TEXT node directly', () => {
    const textNode: SmithersNode = {
      type: 'TEXT',
      props: { value: 'Hello world' },
      children: [],
      parent: null,
    }
    const xml = serialize(textNode)

    expect(xml).toBe('Hello world')
  })

  test('escapes ampersand before other entities', () => {
    // This tests the critical order of escaping
    const node = createNode('step', {}, ['&lt; is already escaped'])
    const xml = serialize(node)

    // & should be escaped first, so &lt; becomes &amp;lt;
    expect(xml).toContain('&amp;lt;')
  })

  test('filters out children from props', () => {
    const node = createNode('step', { children: 'ignored', name: 'test' })
    const xml = serialize(node)

    // children prop should not appear as attribute
    expect(xml).not.toMatch(/children=/)
    expect(xml).toContain('name="test"')
  })
})

describe('unknown parent warnings', () => {
  test('serializes arbitrary elements like <loop> correctly', () => {
    const node = createNode('loop', { iterations: '3' }, ['Do work'])
    const xml = serialize(node)

    expect(xml).toContain('<loop iterations="3">')
    expect(xml).toContain('Do work')
    expect(xml).toContain('</loop>')
  })

  test('adds warning when known type is inside unknown parent', () => {
    const phase = createNode('phase', { name: 'test' })
    const loop = createNode('loop', {}, [phase])
    serialize(loop)

    expect(phase.warnings).toBeDefined()
    expect(phase.warnings).toHaveLength(1)
    expect(phase.warnings![0]).toBe('<phase> rendered inside unknown element <loop>')
  })

  test('no warning when unknown type is inside unknown parent', () => {
    const myelem = createNode('myelem', {}, ['text'])
    const loop = createNode('loop', {}, [myelem])
    serialize(loop)

    expect(myelem.warnings).toBeUndefined()
  })

  test('no warning when known type is inside known parent', () => {
    const step = createNode('step', {}, ['Do work'])
    const phase = createNode('phase', { name: 'main' }, [step])
    serialize(phase)

    expect(step.warnings).toBeUndefined()
  })

  test('adds warning for deeply nested known type under unknown parent', () => {
    const claude = createNode('claude', { model: 'test' })
    const inner = createNode('inner', {}, [claude])
    const loop = createNode('loop', {}, [inner])
    serialize(loop)

    expect(claude.warnings).toBeDefined()
    expect(claude.warnings![0]).toContain('<claude> rendered inside unknown element')
  })

  test('arbitrary nested XML serializes correctly', () => {
    const task = createNode('mytask', {}, ['Do work'])
    const condition = createNode('if', { condition: 'test-pass' }, [task])
    const loop = createNode('loop', { iterations: '3' }, [condition])
    const xml = serialize(loop)

    expect(xml).toContain('<loop iterations="3">')
    expect(xml).toContain('<if condition="test-pass">')
    expect(xml).toContain('<mytask>')
    expect(xml).toContain('Do work')
  })

  test('serialize is idempotent - calling multiple times does not duplicate warnings', () => {
    const phase = createNode('phase', { name: 'test' })
    const loop = createNode('loop', {}, [phase])

    // Call serialize multiple times
    serialize(loop)
    serialize(loop)
    serialize(loop)

    // Warnings should not accumulate
    expect(phase.warnings).toBeDefined()
    expect(phase.warnings).toHaveLength(1)
    expect(phase.warnings![0]).toBe('<phase> rendered inside unknown element <loop>')
  })

  test('no redundant warnings for deeply nested known components under unknown parent', () => {
    // <loop><phase><claude /></phase></loop>
    // Only phase should get the warning, not claude (because claude is under a known parent)
    const claude = createNode('claude', { model: 'test' })
    const phase = createNode('phase', { name: 'main' }, [claude])
    const loop = createNode('loop', {}, [phase])
    serialize(loop)

    // phase should have warning about being inside loop
    expect(phase.warnings).toBeDefined()
    expect(phase.warnings).toHaveLength(1)
    expect(phase.warnings![0]).toBe('<phase> rendered inside unknown element <loop>')

    // claude should NOT have warning because its immediate parent (phase) is a known type
    expect(claude.warnings).toBeUndefined()
  })

  test('clears warnings on nodes that no longer warrant them', () => {
    // First, put a known component inside an unknown parent
    const phase = createNode('phase', { name: 'test' })
    const loop = createNode('loop', {}, [phase])
    serialize(loop)
    expect(phase.warnings).toHaveLength(1)

    // Now move phase to be a child of a known parent (ROOT)
    const root = createNode('ROOT', {}, [phase])
    phase.parent = root
    serialize(root)

    // Warnings should be cleared since phase is now under ROOT
    expect(phase.warnings).toBeUndefined()
  })
})
