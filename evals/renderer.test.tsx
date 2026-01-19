/**
 * Renderer Tests
 *
 * Tests JSX rendering, serialization, and edge cases.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { serialize } from '../src/reconciler/serialize'
import type { SmithersNode } from '../src/reconciler/types'
import { createSmithersRoot, type SmithersRoot } from '../src/reconciler/root'
import { createSmithersDB, type SmithersDB } from '../src/db/index'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Claude } from '../src/components/Claude'

describe('renderPlan()', () => {
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'renderer-test')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('single Claude component', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Claude model="sonnet">Hello world</Claude>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<claude')
    expect(xml).toContain('Hello world')
  })

  test('nested Phase > Step components', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="outer">
          <Step name="inner">Step content</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('<phase name="outer"')
    expect(xml).toContain('<step')
    expect(xml).toContain('Step content')
  })

  test('multiple sibling components', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="test">
          <Step name="step1">First</Step>
          <Step name="step2">Second</Step>
          <Step name="step3">Third</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('First')
    expect(xml).toContain('Second')
    expect(xml).toContain('Third')
  })

  test('components with prop types', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="typed">
          <Claude model="opus" maxTokens={1000}>Prompt</Claude>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('model="opus"')
    expect(xml).toContain('Prompt')
  })

  test('conditional rendering', async () => {
    const showStep = true
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="conditional">
          {showStep && <Step name="visible">Shown</Step>}
          {!showStep && <Step name="hidden">Hidden</Step>}
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Shown')
    expect(xml).not.toContain('Hidden')
  })

  test('array children from map', async () => {
    const items = ['a', 'b', 'c']
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="mapped">
          {items.map((item, i) => (
            <Step key={i} name={`step-${item}`}>{item}</Step>
          ))}
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('step-a')
    expect(xml).toContain('step-b')
    expect(xml).toContain('step-c')
  })

  test('Fragment children', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="fragment">
          <>
            <Step name="frag1">Fragment 1</Step>
            <Step name="frag2">Fragment 2</Step>
          </>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Fragment 1')
    expect(xml).toContain('Fragment 2')
  })

  test('deeply nested trees (10+ levels)', async () => {
    const DeepNest = ({ depth }: { depth: number }) => {
      if (depth <= 0) return <step>Bottom</step>
      return (
        <phase name={`level-${depth}`}>
          <DeepNest depth={depth - 1} />
        </phase>
      )
    }
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="deep">
          <DeepNest depth={10} />
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('level-1')
    expect(xml).toContain('level-10')
    expect(xml).toContain('Bottom')
  })

  test('very wide trees (100+ siblings)', async () => {
    const manySteps = Array.from({ length: 100 }, (_, i) => (
      <step key={i}>{`Step ${i}`}</step>
    ))
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="wide">
          {manySteps}
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('Step 0')
    expect(xml).toContain('Step 50')
    expect(xml).toContain('Step 99')
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
  let root: SmithersRoot
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('eval-test', 'edge-cases')
    root = createSmithersRoot()
  })

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 50))
    root.dispose()
    db.close()
  })

  test('unicode characters in prompts', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="unicode">
          <Step name="emoji">Hello 👋 世界 🌍</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).toContain('👋')
    expect(xml).toContain('世界')
    expect(xml).toContain('🌍')
  })

  test('special XML chars in content', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId}>
        <Phase name="special">
          <Step name="chars">{"<tag> & \"quotes\" 'apos'"}</Step>
        </Phase>
      </SmithersProvider>
    )
    const xml = root.toXML()
    expect(xml).not.toContain('&amp;amp;')
    expect(xml).not.toContain('<tag>')
  })

  test('empty component renders self-closing tag', async () => {
    await root.render(<step />)
    const xml = root.toXML()
    expect(xml).toContain('<step')
  })

  test('numeric zero as prop value', async () => {
    await root.render(<phase name="test" count={0} />)
    const xml = root.toXML()
    expect(xml).toContain('count="0"')
  })

  test('empty string as prop value', async () => {
    await root.render(<phase name="" description="" />)
    const xml = root.toXML()
    expect(xml).toContain('name=""')
  })
})
