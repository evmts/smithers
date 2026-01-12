import { describe, test, expect } from 'bun:test'
import {
  createSmithersSolidRoot,
  renderPlan,
  serialize,
  Claude,
  Phase,
  Step,
  Task,
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

  test('mount renders claude with text', async () => {
    const root = createSmithersSolidRoot()
    root.mount(() => <Claude>Hello world</Claude>)
    await root.flush()

    const tree = root.getTree()
    expect(tree.children).toHaveLength(1)

    const claude = tree.children[0]
    expect(claude.type).toBe('claude')
    expect(claude.parent).toBe(tree)
    expect(claude.children).toHaveLength(1)

    const text = claude.children[0]
    expect(text.type).toBe('TEXT')
    expect(text.props.value).toBe('Hello world')
    expect(text.parent).toBe(claude)

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
    const xml = await renderPlan(() => (
      <Claude model="claude-3-opus" maxTurns={10} />
    ))

    expect(xml).toContain('<claude ')
    expect(xml).toContain('model="claude-3-opus"')
    expect(xml).toContain('maxTurns="10"')
    expect(xml).toContain('/>')
  })

  test('serialize escapes XML special characters', async () => {
    const xml = await renderPlan(() => (
      <Claude>{'<script>alert("xss")</script>'}</Claude>
    ))

    expect(xml).toBe(
      '<claude>\n  &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;\n</claude>'
    )
  })

  test('serialize excludes callback props', async () => {
    const xml = await renderPlan(() => (
      <Claude model="claude-3-opus" onFinished={() => {}} onError={() => {}} />
    ))

    expect(xml).toBe('<claude model="claude-3-opus" />')
    expect(xml).not.toContain('onFinished')
    expect(xml).not.toContain('onError')
  })
})

describe('Solid Renderer XML Parity', () => {
  test('simple claude element serializes correctly', async () => {
    const xml = await renderPlan(() => <Claude>Hello world</Claude>)
    expect(xml).toBe('<claude>\n  Hello world\n</claude>')
  })

  test('nested phase/step serializes correctly', async () => {
    const xml = await renderPlan(() => (
      <Claude>
        <Phase name="research">
          <Step>Find sources</Step>
          <Step>Summarize</Step>
        </Phase>
      </Claude>
    ))

    expect(xml).toContain('<claude>')
    expect(xml).toContain('<phase name="research">')
    expect(xml).toContain('<step>')
    expect(xml).toContain('Find sources')
    expect(xml).toContain('Summarize')
    expect(xml).toContain('</phase>')
    expect(xml).toContain('</claude>')
  })

  test('task component renders as task element', async () => {
    const xml = await renderPlan(() => <Task done>Track progress</Task>)
    expect(xml).toBe('<task done="true">\n  Track progress\n</task>')
  })
})
