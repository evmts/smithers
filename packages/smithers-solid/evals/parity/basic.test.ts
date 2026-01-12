import { describe, test, expect } from 'bun:test'
import {
  createSmithersSolidRoot,
  serialize,
  Claude,
  Phase,
  Step,
  type SmithersNode,
} from '../../src/index.js'

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

  test('serialize handles TEXT node', () => {
    const node: SmithersNode = {
      type: 'TEXT',
      props: { value: 'Hello world' },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toBe('Hello world')
  })

  test('serialize escapes XML special characters', () => {
    const node: SmithersNode = {
      type: 'TEXT',
      props: { value: '<script>alert("xss")</script>' },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })

  test('serialize handles element with props', () => {
    const node: SmithersNode = {
      type: 'claude',
      props: { model: 'claude-3-opus', maxTurns: 10 },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toBe('<claude model="claude-3-opus" maxTurns="10" />')
  })

  test('serialize handles nested elements', () => {
    const root: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [],
      parent: null,
    }

    const claude: SmithersNode = {
      type: 'claude',
      props: {},
      children: [],
      parent: root,
    }

    const text: SmithersNode = {
      type: 'TEXT',
      props: { value: 'Hello world' },
      children: [],
      parent: claude,
    }

    claude.children.push(text)
    root.children.push(claude)

    const xml = serialize(root)
    expect(xml).toBe('<claude>\n  Hello world\n</claude>')
  })

  test('Claude component creates correct node structure', () => {
    const node = Claude({})

    expect(node.type).toBe('claude')
    expect(node.props).toEqual({})
    expect(node.children).toEqual([])
    expect(node.parent).toBeNull()
  })

  test('Claude component preserves props', () => {
    const node = Claude({
      model: 'claude-3-opus',
      maxTurns: 10,
      onFinished: () => {},
    })

    expect(node.type).toBe('claude')
    expect(node.props.model).toBe('claude-3-opus')
    expect(node.props.maxTurns).toBe(10)
    expect(node.props.onFinished).toBeDefined()
  })

  test('Phase component creates correct node structure', () => {
    const node = Phase({ name: 'research' })

    expect(node.type).toBe('phase')
    expect(node.props.name).toBe('research')
  })

  test('Step component creates correct node structure', () => {
    const node = Step({})

    expect(node.type).toBe('step')
  })

  test('serialize excludes callback props', () => {
    const node: SmithersNode = {
      type: 'claude',
      props: {
        model: 'claude-3-opus',
        onFinished: () => {},
        onError: () => {},
      },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    // Should not include onFinished or onError
    expect(xml).toBe('<claude model="claude-3-opus" />')
    expect(xml).not.toContain('onFinished')
    expect(xml).not.toContain('onError')
  })
})

describe('Solid Renderer XML Parity', () => {
  test('simple claude element serializes correctly', () => {
    const node = Claude({})
    const text: SmithersNode = {
      type: 'TEXT',
      props: { value: 'Hello world' },
      children: [],
      parent: node,
    }
    node.children.push(text)

    const xml = serialize(node)
    expect(xml).toBe('<claude>\n  Hello world\n</claude>')
  })

  test('nested phase/step serializes correctly', () => {
    const claude = Claude({})
    const phase = Phase({ name: 'research' })
    const step1 = Step({})
    const step1Text: SmithersNode = {
      type: 'TEXT',
      props: { value: 'Find sources' },
      children: [],
      parent: step1,
    }
    step1.children.push(step1Text)
    step1.parent = phase

    const step2 = Step({})
    const step2Text: SmithersNode = {
      type: 'TEXT',
      props: { value: 'Summarize' },
      children: [],
      parent: step2,
    }
    step2.children.push(step2Text)
    step2.parent = phase

    phase.children.push(step1, step2)
    phase.parent = claude
    claude.children.push(phase)

    const xml = serialize(claude)
    expect(xml).toContain('<claude>')
    expect(xml).toContain('<phase name="research">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('Find sources')
    expect(xml).toContain('Summarize')
    expect(xml).toContain('</phase>')
    expect(xml).toContain('</claude>')
  })
})
