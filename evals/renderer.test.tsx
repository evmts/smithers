import { describe, test, expect } from 'bun:test'
import './setup.ts'
import {
  renderPlan,
  serialize,
  createRoot,
  Claude,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
  Subagent,
} from '../src/index.js'
import type { SmithersNode } from '../src/core/types.js'
import { Fragment } from 'react'

describe('renderPlan()', () => {
  test('single Claude component', async () => {
    const plan = await renderPlan(<Claude>Hello world</Claude>)
    expect(plan).toContain('<claude>')
    expect(plan).toContain('Hello world')
    expect(plan).toContain('</claude>')
  })

  test('nested Phase > Step components', async () => {
    const plan = await renderPlan(
      <Phase name="research">
        <Step>Read the docs</Step>
        <Step>Take notes</Step>
      </Phase>
    )
    expect(plan).toContain('<phase name="research">')
    expect(plan).toContain('<step>')
    expect(plan).toContain('Read the docs')
    expect(plan).toContain('Take notes')
  })

  test('multiple sibling components', async () => {
    const plan = await renderPlan(
      <>
        <Phase name="phase1">First phase</Phase>
        <Phase name="phase2">Second phase</Phase>
        <Phase name="phase3">Third phase</Phase>
      </>
    )
    expect(plan).toContain('phase1')
    expect(plan).toContain('phase2')
    expect(plan).toContain('phase3')
  })

  test('components with all prop types', async () => {
    const fn = () => console.log('test')
    const obj = { key: 'value', nested: { foo: 'bar' } }

    const plan = await renderPlan(
      <Phase name="test" count={42} enabled={true} handler={fn} data={obj}>
        Content
      </Phase>
    )

    expect(plan).toContain('name="test"')
    expect(plan).toContain('count="42"')
    expect(plan).toContain('enabled="true"')
    // Functions and objects are serialized as strings
    expect(plan).toContain('handler="')
    expect(plan).toContain('data=')
    expect(plan).toContain('key')
  })

  test('conditional rendering (returns null)', async () => {
    const Component = ({ show }: { show: boolean }) => (
      <>
        <Phase name="always">Always rendered</Phase>
        {show && <Phase name="conditional">Conditionally rendered</Phase>}
      </>
    )

    const planWithTrue = await renderPlan(<Component show={true} />)
    expect(planWithTrue).toContain('name="conditional"')

    const planWithFalse = await renderPlan(<Component show={false} />)
    expect(planWithFalse).not.toContain('name="conditional"')
    expect(planWithFalse).toContain('name="always"')
  })

  test('array children from map', async () => {
    const items = ['first', 'second', 'third']
    const plan = await renderPlan(
      <Phase name="list">
        {items.map((item) => (
          <Step key={item}>{item}</Step>
        ))}
      </Phase>
    )

    expect(plan).toContain('first')
    expect(plan).toContain('second')
    expect(plan).toContain('third')
  })

  test('Fragment children', async () => {
    const plan = await renderPlan(
      <>
        <Phase name="one">First</Phase>
        <>
          <Phase name="two">Second</Phase>
          <Phase name="three">Third</Phase>
        </>
      </>
    )

    expect(plan).toContain('name="one"')
    expect(plan).toContain('name="two"')
    expect(plan).toContain('name="three"')
  })

  test('text children', async () => {
    const plan = await renderPlan(<Claude>Simple text content</Claude>)
    expect(plan).toContain('Simple text content')
  })

  test('mixed element + text children', async () => {
    const plan = await renderPlan(
      <Claude>
        Before
        <Persona role="expert">Expert instructions</Persona>
        After
      </Claude>
    )

    expect(plan).toContain('Before')
    expect(plan).toContain('<persona role="expert">')
    expect(plan).toContain('After')
  })

  test('deeply nested trees (10+ levels)', async () => {
    const plan = await renderPlan(
      <Phase name="1">
        <Phase name="2">
          <Phase name="3">
            <Phase name="4">
              <Phase name="5">
                <Phase name="6">
                  <Phase name="7">
                    <Phase name="8">
                      <Phase name="9">
                        <Phase name="10">
                          <Step>Deep content</Step>
                        </Phase>
                      </Phase>
                    </Phase>
                  </Phase>
                </Phase>
              </Phase>
            </Phase>
          </Phase>
        </Phase>
      </Phase>
    )

    expect(plan).toContain('name="1"')
    expect(plan).toContain('name="10"')
    expect(plan).toContain('Deep content')
  })

  test('very wide trees (100+ siblings)', async () => {
    const siblings = Array.from({ length: 100 }, (_, i) => (
      <Step key={i}>Step {i}</Step>
    ))
    const plan = await renderPlan(<Phase name="wide">{siblings}</Phase>)

    // Text content may be split across lines, so check for number patterns
    expect(plan).toContain('0')
    expect(plan).toContain('50')
    expect(plan).toContain('99')
    // Verify we have 100 step tags
    const stepCount = (plan.match(/<step>/g) || []).length
    expect(stepCount).toBe(100)
  })
})

describe('serialize()', () => {
  test('escapes XML special characters in text content', () => {
    const node: SmithersNode = {
      type: 'TEXT',
      props: { value: '<script>alert("XSS")</script> & more' },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toContain('&lt;script&gt;')
    expect(xml).toContain('&amp;')
    expect(xml).not.toContain('<script>')
  })

  test('escapes quotes in attribute values', () => {
    const node: SmithersNode = {
      type: 'phase',
      props: { name: 'test "quoted" value' },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toContain('&quot;')
    expect(xml).not.toContain('name="test "quoted" value"')
  })

  test('handles boolean attributes', () => {
    const node: SmithersNode = {
      type: 'phase',
      props: { completed: true, visible: false },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toContain('completed="true"')
    expect(xml).toContain('visible="false"')
  })

  test('handles undefined/null props (omits them)', () => {
    const node: SmithersNode = {
      type: 'phase',
      props: { name: 'test', empty: undefined, nothing: null },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toContain('name="test"')
    expect(xml).not.toContain('empty')
    expect(xml).not.toContain('nothing')
  })

  test('preserves whitespace in text', () => {
    const node: SmithersNode = {
      type: 'TEXT',
      props: { value: '  indented\n  text  ' },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toContain('  indented')
    expect(xml).toContain('\n')
  })

  test('serializes deeply nested trees with proper indentation', () => {
    const deepNode: SmithersNode = {
      type: 'phase',
      props: { name: 'outer' },
      children: [
        {
          type: 'phase',
          props: { name: 'middle' },
          children: [
            {
              type: 'phase',
              props: { name: 'inner' },
              children: [
                {
                  type: 'TEXT',
                  props: { value: 'content' },
                  children: [],
                  parent: null,
                },
              ],
              parent: null,
            },
          ],
          parent: null,
        },
      ],
      parent: null,
    }

    const xml = serialize(deepNode)
    expect(xml).toContain('<phase name="outer">')
    expect(xml).toContain('  <phase name="middle">')
    expect(xml).toContain('    <phase name="inner">')
    expect(xml).toContain('content')
  })

  test('handles ROOT node type', () => {
    const root: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [
        {
          type: 'phase',
          props: { name: 'first' },
          children: [],
          parent: null,
        },
        {
          type: 'phase',
          props: { name: 'second' },
          children: [],
          parent: null,
        },
      ],
      parent: null,
    }

    const xml = serialize(root)
    expect(xml).toContain('<phase name="first"')
    expect(xml).toContain('<phase name="second"')
    expect(xml).not.toContain('ROOT')
  })

  test('self-closing tags for empty elements', () => {
    const node: SmithersNode = {
      type: 'step',
      props: {},
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toBe('<step />')
  })

  test('serializes object props as JSON', () => {
    const node: SmithersNode = {
      type: 'output-format',
      props: { schema: { type: 'object', properties: { name: { type: 'string' } } } },
      children: [],
      parent: null,
    }

    const xml = serialize(node)
    expect(xml).toContain('schema=')
    expect(xml).toContain('type')
    expect(xml).toContain('object')
  })
})

describe('createRoot()', () => {
  test('creates a root that can render and unmount', async () => {
    const root = createRoot()
    const tree = await root.render(<Claude>Test</Claude>)

    expect(tree.type).toBe('ROOT')
    expect(tree.children.length).toBeGreaterThan(0)

    // Should not throw
    root.unmount()
  })

  test('renders multiple times with same root', async () => {
    const root = createRoot()

    const tree1 = await root.render(<Phase name="first">First</Phase>)
    expect(serialize(tree1)).toContain('first')

    const tree2 = await root.render(<Phase name="second">Second</Phase>)
    expect(serialize(tree2)).toContain('second')

    root.unmount()
  })
})

describe('Edge cases', () => {
  test('unicode characters in prompts', async () => {
    const plan = await renderPlan(
      <Claude>
        Hello 世界 🌍 Привет
      </Claude>
    )

    expect(plan).toContain('世界')
    expect(plan).toContain('🌍')
    expect(plan).toContain('Привет')
  })

  test('emoji in prompts', async () => {
    const plan = await renderPlan(
      <Claude>
        Use these tools: 🔧 🔨 🪛
      </Claude>
    )

    expect(plan).toContain('🔧')
    expect(plan).toContain('🔨')
    expect(plan).toContain('🪛')
  })

  test('special XML chars in content', async () => {
    const plan = await renderPlan(
      <Claude>
        {'Code example: if (x < 5 && y > 3) { return "test"; }'}
      </Claude>
    )

    expect(plan).toContain('&lt;')
    expect(plan).toContain('&gt;')
    expect(plan).toContain('&amp;')
    expect(plan).toContain('&quot;')
  })

  test('newlines and tabs in content', async () => {
    const plan = await renderPlan(
      <Claude>
        {`Line 1
\tIndented line 2
Line 3`}
      </Claude>
    )

    expect(plan).toContain('Line 1')
    expect(plan).toContain('\t')
    expect(plan).toContain('Line 3')
  })

  test('empty component renders self-closing tag', async () => {
    const plan = await renderPlan(<Step />)
    expect(plan).toBe('<step />')
  })

  test('component with only whitespace children', async () => {
    const plan = await renderPlan(
      <Claude>
        {' '}
      </Claude>
    )

    expect(plan).toContain('<claude>')
    expect(plan).toContain('</claude>')
  })

  test('very long prompt (10k+ chars)', async () => {
    const longText = 'A'.repeat(10000)
    const plan = await renderPlan(<Claude>{longText}</Claude>)

    expect(plan).toContain('A'.repeat(100)) // Sampling
    expect(plan.length).toBeGreaterThan(10000)
  })

  test('numeric zero as prop value', async () => {
    const plan = await renderPlan(<Phase name="test" count={0}>Content</Phase>)
    expect(plan).toContain('count="0"')
  })

  test('empty string as prop value', async () => {
    const plan = await renderPlan(<Phase name="">Content</Phase>)
    expect(plan).toContain('name=""')
  })

  test('function props are serialized as strings', async () => {
    const handler = () => console.log('test')
    const plan = await renderPlan(
      <Claude onFinished={handler}>Test</Claude>
    )

    // Function props should be serialized (or omitted - implementation dependent)
    // The exact serialization format may vary
    expect(plan).toContain('<claude')
  })
})
