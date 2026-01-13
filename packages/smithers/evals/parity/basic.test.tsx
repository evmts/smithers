import { describe, test, expect } from 'bun:test'
import { createSmithersSolidRoot, renderPlan, serialize, type SmithersNode } from '../../src/index.js'

function textNode(value: string): SmithersNode {
  return {
    type: 'TEXT',
    props: { value },
    children: [],
    parent: null,
  }
}

function createNode(
  type: string,
  props: Record<string, unknown> = {},
  children: SmithersNode[] = []
): SmithersNode {
  const node: SmithersNode = {
    type,
    props,
    children,
    parent: null,
  }

  for (const child of children) {
    child.parent = node
  }

  return node
}

describe('Solid Renderer Basic Tests', () => {
  test('createSmithersSolidRoot creates a root node', () => {
    const root = createSmithersSolidRoot()
    const tree = root.getTree()

    expect(tree).toBeDefined()
    expect(tree.type).toBe('ROOT')
    expect(tree.children).toEqual([])
    expect(tree.parent).toBeNull()

    root.dispose()
  })

  test('mount renders claude with text', async () => {
    const root = createSmithersSolidRoot()
    const claude = createNode('claude', {}, [textNode('Hello world')])
    root.mount(() => claude)
    await root.flush()

    const tree = root.getTree()
    expect(tree.children).toHaveLength(1)

    const mountedClaude = tree.children[0]
    expect(mountedClaude.type).toBe('claude')
    expect(mountedClaude.parent).toBe(tree)
    expect(mountedClaude.children).toHaveLength(1)

    const text = mountedClaude.children[0]
    expect(text.type).toBe('TEXT')
    expect(text.props.value).toBe('Hello world')
    expect(text.parent).toBe(mountedClaude)

    root.dispose()
  })

  test('serialize handles ROOT node', () => {
    const root: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }

    const xml = serialize(root)
    expect(xml).toBe('')
  })

  test('renderPlan serializes element with props', async () => {
    const xml = await renderPlan(() =>
      createNode('claude', { model: 'claude-3-opus', maxTurns: 10 })
    )

    expect(xml).toContain('<claude ')
    expect(xml).toContain('model="claude-3-opus"')
    expect(xml).toContain('maxTurns="10"')
    expect(xml).toContain('/>')
  })

  test('serialize escapes XML special characters', async () => {
    const xml = await renderPlan(() =>
      createNode('claude', {}, [textNode('<script>alert("xss")</script>')])
    )

    expect(xml).toBe(
      '<claude>\n  &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;\n</claude>'
    )
  })

  test('serialize excludes callback props', async () => {
    const xml = await renderPlan(() =>
      createNode('claude', {
        model: 'claude-3-opus',
        onFinished: () => {},
        onError: () => {},
      })
    )

    expect(xml).toBe('<claude model="claude-3-opus" />')
    expect(xml).not.toContain('onFinished')
    expect(xml).not.toContain('onError')
  })
})

describe('Solid Renderer XML Parity', () => {
  test('simple claude element serializes correctly', async () => {
    const xml = await renderPlan(() =>
      createNode('claude', {}, [textNode('Hello world')])
    )
    expect(xml).toBe('<claude>\n  Hello world\n</claude>')
  })

  test('nested phase/step serializes correctly', async () => {
    const xml = await renderPlan(() =>
      createNode('claude', {}, [
        createNode('phase', { name: 'research' }, [
          createNode('step', {}, [textNode('Find sources')]),
          createNode('step', {}, [textNode('Summarize')]),
        ]),
      ])
    )

    expect(xml).toContain('<claude>')
    expect(xml).toContain('<phase name="research">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('Find sources')
    expect(xml).toContain('Summarize')
    expect(xml).toContain('</phase>')
    expect(xml).toContain('</claude>')
  })

  test('task component renders as task element', async () => {
    const xml = await renderPlan(() =>
      createNode('task', { done: true }, [textNode('Track progress')])
    )
    expect(xml).toBe('<task done="true">\n  Track progress\n</task>')
  })
})
