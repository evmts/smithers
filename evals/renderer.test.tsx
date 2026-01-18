/**
 * Renderer Tests
 *
 * Tests JSX rendering, serialization, and edge cases.
 */
import { describe, test, expect } from 'bun:test'
import './setup'
import { renderPlan, createNode } from '../test/utils'
import { serialize } from '../src/core/serialize'
import { createSmithersRoot } from '../src/solid/root'
import { Claude } from '../src/components/Claude'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Persona } from '../src/components/Persona'
import type { SmithersNode } from '../src/core/types'

describe('renderPlan()', () => {
  test('single Claude component', async () => {
    const plan = await renderPlan(() => <Claude>Hello world</Claude>)
    expect(plan).toContain('<claude')
    expect(plan).toContain('Hello world')
    expect(plan).toContain('</claude>')
  })

  test('nested Phase > Step components', async () => {
    const plan = await renderPlan(() => (
      <Phase name="research">
        <Step>Read the docs</Step>
        <Step>Take notes</Step>
      </Phase>
    ))
    expect(plan).toContain('<phase name="research">')
    expect(plan).toContain('<step')
    expect(plan).toContain('Read the docs')
    expect(plan).toContain('Take notes')
  })

  test('multiple sibling components', async () => {
    const plan = await renderPlan(() => (
      <>
        <Phase name="phase1">First phase</Phase>
        <Phase name="phase2">Second phase</Phase>
        <Phase name="phase3">Third phase</Phase>
      </>
    ))
    expect(plan).toContain('phase1')
    expect(plan).toContain('phase2')
    expect(plan).toContain('phase3')
  })

  test('components with prop types', async () => {
    const obj = { key: 'value', nested: { foo: 'bar' } }

    const plan = await renderPlan(() => (
      <Phase name="test" count={42} enabled={true} data={obj}>
        Content
      </Phase>
    ))

    expect(plan).toContain('name="test"')
    expect(plan).toContain('count="42"')
    expect(plan).toContain('enabled="true"')
    expect(plan).toContain('data=')
  })

  test('conditional rendering', async () => {
    const Component = (props: { show: boolean }) => (
      <>
        <Phase name="always">Always rendered</Phase>
        {props.show && <Phase name="conditional">Conditionally rendered</Phase>}
      </>
    )

    const planWithTrue = await renderPlan(() => <Component show={true} />)
    expect(planWithTrue).toContain('name="conditional"')

    const planWithFalse = await renderPlan(() => <Component show={false} />)
    expect(planWithFalse).not.toContain('name="conditional"')
    expect(planWithFalse).toContain('name="always"')
  })

  test('array children from map', async () => {
    const items = ['first', 'second', 'third']
    const plan = await renderPlan(() => (
      <Phase name="list">
        {items.map((item) => (
          <Step key={item}>{item}</Step>
        ))}
      </Phase>
    ))

    expect(plan).toContain('first')
    expect(plan).toContain('second')
    expect(plan).toContain('third')
  })

  test('Fragment children', async () => {
    const plan = await renderPlan(() => (
      <>
        <Phase name="one">First</Phase>
        <>
          <Phase name="two">Second</Phase>
          <Phase name="three">Third</Phase>
        </>
      </>
    ))

    expect(plan).toContain('name="one"')
    expect(plan).toContain('name="two"')
    expect(plan).toContain('name="three"')
  })

  test('deeply nested trees (10+ levels)', async () => {
    const plan = await renderPlan(() => (
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
    ))

    expect(plan).toContain('name="1"')
    expect(plan).toContain('name="10"')
    expect(plan).toContain('Deep content')
  })

  test('very wide trees (100+ siblings)', async () => {
    const siblings = Array.from({ length: 100 }, (_, i) => (
      <Step key={i}>Step {i}</Step>
    ))
    const plan = await renderPlan(() => <Phase name="wide">{siblings}</Phase>)

    expect(plan).toContain('0')
    expect(plan).toContain('50')
    expect(plan).toContain('99')
    const stepCount = (plan.match(/<step/g) || []).length
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

  test('handles ROOT node type', () => {
    const root: SmithersNode = {
      type: 'ROOT',
      props: {},
      children: [
        { type: 'phase', props: { name: 'first' }, children: [], parent: null },
        { type: 'phase', props: { name: 'second' }, children: [], parent: null },
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
})

describe('Edge cases', () => {
  test('unicode characters in prompts', async () => {
    const plan = await renderPlan(() => (
      <Claude>Hello 世界</Claude>
    ))
    expect(plan).toContain('世界')
  })

  test('special XML chars in content', async () => {
    const plan = await renderPlan(() => (
      <Claude>
        {'Code: if (x < 5 && y > 3) { return "test"; }'}
      </Claude>
    ))

    expect(plan).toContain('&lt;')
    expect(plan).toContain('&gt;')
    expect(plan).toContain('&amp;')
  })

  test('empty component renders self-closing tag', async () => {
    const plan = await renderPlan(() => <Step />)
    expect(plan).toBe('<step />')
  })

  test('numeric zero as prop value', async () => {
    const plan = await renderPlan(() => <Phase name="test" count={0}>Content</Phase>)
    expect(plan).toContain('count="0"')
  })

  test('empty string as prop value', async () => {
    const plan = await renderPlan(() => <Phase name="">Content</Phase>)
    expect(plan).toContain('name=""')
  })
})
