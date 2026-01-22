/**
 * Eval 13: Advanced Component Composition
 *
 * Tests complex composition patterns - deep nesting, wide trees, conditionals,
 * dynamic rendering, fragments, and null handling. Validates XML structure
 * without execution.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Claude } from '../src/components/Claude'
import { Parallel } from '../src/components/Parallel'
import { Task } from '../src/components/Task'
import { validateXML } from './validation/output-validator'
import { Fragment } from 'react'

describe('13-composition-advanced', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('composition-advanced')
  })

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('Nested Phase > Step > Claude renders - 3 level nesting', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="outer">
          <Step name="middle">
            <Claude model="sonnet">Innermost content</Claude>
          </Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Verify 3-level nesting
    expect(xml).toContain('<phase name="outer"')
    expect(xml).toContain('<step')
    expect(xml).toContain('name="middle"')
    expect(xml).toContain('<claude')
    expect(xml).toContain('model="sonnet"')
    expect(xml).toContain('Innermost content')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-nested-3-levels',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        nesting_depth: 3,
      },
      errors: [],
    })
  })

  test('Conditional rendering works - {condition && <Component>}', async () => {
    const startTime = Date.now()
    const showStep = true
    const hideStep = false

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="conditional">
          {showStep && <Step name="visible">This renders</Step>}
          {hideStep && <Step name="hidden">This does not render</Step>}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Should contain visible step
    expect(xml).toContain('name="visible"')
    expect(xml).toContain('This renders')

    // Should NOT contain hidden step
    expect(xml).not.toContain('name="hidden"')
    expect(xml).not.toContain('This does not render')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-conditional-rendering',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        conditional_works: true,
      },
      errors: [],
    })
  })

  test('Dynamic Step creation from array - {[].map(x => <Step>)}', async () => {
    const startTime = Date.now()
    const items = ['alpha', 'beta', 'gamma']

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="dynamic">
          {items.map(item => (
            <Step key={item} name={item}>
              Processing {item}
            </Step>
          ))}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Verify all mapped items rendered
    expect(xml).toContain('name="alpha"')
    expect(xml).toContain('alpha')
    expect(xml).toContain('name="beta"')
    expect(xml).toContain('beta')
    expect(xml).toContain('name="gamma"')
    expect(xml).toContain('gamma')

    // Count step elements
    const stepCount = (xml.match(/<step/g) || []).length
    expect(stepCount).toBe(3)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-dynamic-array-map',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        steps_generated: stepCount,
      },
      errors: [],
    })
  })

  test('Mixed Parallel + Sequential renders - Phase with Parallel inside', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="mixed">
          <Step name="sequential-1">First sequential step</Step>
          <Parallel>
            <Step name="parallel-1">Parallel step 1</Step>
            <Step name="parallel-2">Parallel step 2</Step>
          </Parallel>
          <Step name="sequential-2">Second sequential step</Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Verify parallel wrapper exists
    expect(xml).toContain('<parallel')

    // Verify all steps present
    expect(xml).toContain('name="sequential-1"')
    expect(xml).toContain('name="parallel-1"')
    expect(xml).toContain('name="parallel-2"')
    expect(xml).toContain('name="sequential-2"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-mixed-parallel-sequential',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_parallel: xml.includes('<parallel'),
      },
      errors: [],
    })
  })

  test('Deep nesting validates - 5+ levels deep', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="level-1">
          <Step name="level-2">
            <Task done={false}>
              <Phase name="level-3">
                <Step name="level-4">
                  <Claude model="opus">
                    Level 5 content
                  </Claude>
                </Step>
              </Phase>
            </Task>
          </Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Verify all levels present
    expect(xml).toContain('name="level-1"')
    expect(xml).toContain('name="level-2"')
    expect(xml).toContain('name="level-3"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-deep-nesting-5-levels',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        nesting_depth: 5,
      },
      errors: [],
    })
  })

  test('Wide trees render - 10+ sibling components', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="wide">
          <Step name="step-1">Step 1</Step>
          <Step name="step-2">Step 2</Step>
          <Step name="step-3">Step 3</Step>
          <Step name="step-4">Step 4</Step>
          <Step name="step-5">Step 5</Step>
          <Step name="step-6">Step 6</Step>
          <Step name="step-7">Step 7</Step>
          <Step name="step-8">Step 8</Step>
          <Step name="step-9">Step 9</Step>
          <Step name="step-10">Step 10</Step>
          <Step name="step-11">Step 11</Step>
          <Step name="step-12">Step 12</Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Count step elements
    const stepCount = (xml.match(/<step/g) || []).length
    expect(stepCount).toBeGreaterThanOrEqual(12)

    // Spot check some steps
    expect(xml).toContain('name="step-1"')
    expect(xml).toContain('name="step-6"')
    expect(xml).toContain('name="step-12"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-wide-tree-12-siblings',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        sibling_count: stepCount,
      },
      errors: [],
    })
  })

  test('Fragment children render - <>{children}</>', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="fragments">
          <Fragment>
            <Step name="fragment-1">First in fragment</Step>
            <Step name="fragment-2">Second in fragment</Step>
          </Fragment>
          <Step name="outside">Outside fragment</Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Fragment should be transparent - children render directly
    expect(xml).toContain('name="fragment-1"')
    expect(xml).toContain('name="fragment-2"')
    expect(xml).toContain('name="outside"')

    // Fragment itself should not appear in XML
    expect(xml).not.toContain('<fragment')
    expect(xml).not.toContain('Fragment')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-fragment-children',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        fragment_transparent: !xml.includes('<fragment'),
      },
      errors: [],
    })
  })

  test('Null children filtered - {null} {undefined} don\'t break rendering', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="filter-test">
          {null}
          <Step name="valid-1">Valid step 1</Step>
          {undefined}
          {false}
          <Step name="valid-2" />
          {null}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Valid steps should render
    expect(xml).toContain('name="valid-1"')
    expect(xml).toContain('Valid step 1')
    expect(xml).toContain('name="valid-2"')

    // Should not contain 'null' or 'undefined' text
    expect(xml).not.toContain('null')
    expect(xml).not.toContain('undefined')
    expect(xml).not.toContain('false')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-null-children-filtered',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        nulls_filtered: !xml.includes('null'),
      },
      errors: [],
    })
  })

  test('Complex composition validates XML - combine multiple patterns', async () => {
    const startTime = Date.now()
    const tasks = ['design', 'implement', 'test']
    const enableParallel = true

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="complex">
          {/* Sequential step */}
          <Step name="planning">
            <Claude model="opus">Plan the architecture</Claude>
          </Step>

          {/* Dynamic array with conditionals */}
          {tasks.map(task => (
            <Fragment key={task}>
              <Step name={task}>
                <Task done={false}>
                  {task.toUpperCase()}
                </Task>
              </Step>
              {null}
            </Fragment>
          ))}

          {/* Conditional parallel block */}
          {enableParallel && (
            <Parallel>
              <Step name="frontend">
                <Claude model="sonnet">Build UI</Claude>
              </Step>
              <Step name="backend">
                <Claude model="sonnet">Build API</Claude>
              </Step>
            </Parallel>
          )}

          {/* Final step */}
          <Step name="final">Complete deployment</Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Verify sequential step
    expect(xml).toContain('name="planning"')
    expect(xml).toContain('Plan the architecture')

    // Verify dynamic array rendered
    expect(xml).toContain('name="design"')
    expect(xml).toContain('name="implement"')
    expect(xml).toContain('name="test"')
    expect(xml).toContain('design')
    expect(xml).toContain('implement')
    expect(xml).toContain('test')

    // Verify conditional parallel rendered
    expect(xml).toContain('<parallel')
    expect(xml).toContain('name="frontend"')
    expect(xml).toContain('name="backend"')

    // Verify final step
    expect(xml).toContain('name="final"')

    // Verify no null/undefined leaked
    expect(xml).not.toContain('null')
    expect(xml).not.toContain('undefined')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)

    logEvalResult({
      test: '13-complex-composition',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_sequential: true,
        has_dynamic_array: true,
        has_conditional: true,
        has_parallel: xml.includes('<parallel'),
        no_nulls: !xml.includes('null'),
      },
      errors: [],
    })
  })

  // ============================================================================
  // Nesting depth tests - XML rendering validation
  // ============================================================================

  test('Nesting 10 levels deep', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="l1">
          <Step name="l2">
            <Phase name="l3">
              <Step name="l4">
                <Phase name="l5">
                  <Step name="l6">
                    <Phase name="l7">
                      <Step name="l8">
                        <Phase name="l9">
                          <Step name="l10">
                            Level 10 content
                          </Step>
                        </Phase>
                      </Step>
                    </Phase>
                  </Step>
                </Phase>
              </Step>
            </Phase>
          </Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="l1"')
    expect(xml).toContain('name="l5"')
    expect(xml).toContain('name="l10"')
    expect(xml).toContain('Level 10 content')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-nesting-10-levels',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, nesting_depth: 10 },
      errors: [],
    })
  })

  test('Nesting 20 levels deep', async () => {
    const startTime = Date.now()

    // Generate 20 levels programmatically
    const levels = Array.from({ length: 20 }, (_, i) => i + 1)
    const buildNested = (depth: number): any => {
      if (depth > 20) return 'Level 20 content'
      return depth % 2 === 1
        ? <Phase name={`l${depth}`}>{buildNested(depth + 1)}</Phase>
        : <Step name={`l${depth}`}>{buildNested(depth + 1)}</Step>
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        {buildNested(1)}
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="l1"')
    expect(xml).toContain('name="l10"')
    expect(xml).toContain('name="l20"')
    expect(xml).toContain('Level 20 content')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-nesting-20-levels',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, nesting_depth: 20 },
      errors: [],
    })
  })

  // ============================================================================
  // Wide tree tests - XML rendering validation
  // ============================================================================

  test('Wide tree with 50 siblings', async () => {
    const startTime = Date.now()
    const items = Array.from({ length: 50 }, (_, i) => `item-${i + 1}`)

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="wide-50">
          {items.map(item => (
            <Step key={item} name={item}>{item} content</Step>
          ))}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    const stepCount = (xml.match(/<step/g) || []).length
    expect(stepCount).toBe(50)

    expect(xml).toContain('name="item-1"')
    expect(xml).toContain('name="item-25"')
    expect(xml).toContain('name="item-50"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-wide-tree-50',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, sibling_count: stepCount },
      errors: [],
    })
  })

  test('Wide tree with 100 siblings', async () => {
    const startTime = Date.now()
    const items = Array.from({ length: 100 }, (_, i) => `s${i + 1}`)

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="wide-100">
          {items.map(item => (
            <Step key={item} name={item}>{item}</Step>
          ))}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    const stepCount = (xml.match(/<step/g) || []).length
    expect(stepCount).toBe(100)

    expect(xml).toContain('name="s1"')
    expect(xml).toContain('name="s50"')
    expect(xml).toContain('name="s100"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-wide-tree-100',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, sibling_count: stepCount },
      errors: [],
    })
  })

  // ============================================================================
  // Conditional patterns - XML rendering validation
  // ============================================================================

  test('Ternary conditional {cond ? A : B}', async () => {
    const startTime = Date.now()
    const useA = true

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="ternary">
          {useA ? <Step name="option-a">Option A selected</Step> : <Step name="option-b">Option B selected</Step>}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="option-a"')
    expect(xml).toContain('Option A selected')
    expect(xml).not.toContain('name="option-b"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-ternary-conditional',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, selected: 'A' },
      errors: [],
    })
  })

  test('Ternary conditional selecting B', async () => {
    const startTime = Date.now()
    const useA = false

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="ternary">
          {useA ? <Step name="option-a">Option A selected</Step> : <Step name="option-b">Option B selected</Step>}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="option-b"')
    expect(xml).toContain('Option B selected')
    expect(xml).not.toContain('name="option-a"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-ternary-conditional-b',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, selected: 'B' },
      errors: [],
    })
  })

  test('Nested conditionals', async () => {
    const startTime = Date.now()
    const outer = true
    const inner = true

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="nested-cond">
          {outer && (
            <Step name="outer-step">
              {inner && <Task done={false}>Inner task shown</Task>}
            </Step>
          )}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="outer-step"')
    expect(xml).toContain('Inner task shown')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-nested-conditionals',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Multiple independent conditionals', async () => {
    const startTime = Date.now()
    const showFirst = true
    const showSecond = false
    const showThird = true

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="multi-cond">
          {showFirst && <Step name="first">First step</Step>}
          {showSecond && <Step name="second">Second step</Step>}
          {showThird && <Step name="third">Third step</Step>}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="first"')
    expect(xml).not.toContain('name="second"')
    expect(xml).toContain('name="third"')

    const stepCount = (xml.match(/<step/g) || []).length
    expect(stepCount).toBe(2)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-multiple-conditionals',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, step_count: stepCount },
      errors: [],
    })
  })

  // ============================================================================
  // Dynamic rendering - XML rendering validation
  // ============================================================================

  test('Dynamic children with filter', async () => {
    const startTime = Date.now()
    const items = ['apple', 'banana', 'cherry', 'date', 'elderberry']
    const filtered = items.filter(item => item.length > 5)

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="filtered">
          {filtered.map(item => (
            <Step key={item} name={item}>{item}</Step>
          ))}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Only items with length > 5: banana, cherry, elderberry
    expect(xml).toContain('name="banana"')
    expect(xml).toContain('name="cherry"')
    expect(xml).toContain('name="elderberry"')
    expect(xml).not.toContain('name="apple"')
    expect(xml).not.toContain('name="date"')

    const stepCount = (xml.match(/<step/g) || []).length
    expect(stepCount).toBe(3)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-dynamic-filter',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, filtered_count: stepCount },
      errors: [],
    })
  })

  test('Dynamic children with reduce to grouped structure', async () => {
    const startTime = Date.now()
    const items = [
      { group: 'A', name: 'a1' },
      { group: 'A', name: 'a2' },
      { group: 'B', name: 'b1' },
    ]
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.group]) acc[item.group] = []
      acc[item.group].push(item.name)
      return acc
    }, {} as Record<string, string[]>)

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="grouped">
          {Object.entries(grouped).map(([group, names]) => (
            <Step key={group} name={`group-${group}`}>
              {names.map(name => (
                <Task key={name} done={false}>{name}</Task>
              ))}
            </Step>
          ))}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="group-A"')
    expect(xml).toContain('name="group-B"')
    expect(xml).toContain('a1')
    expect(xml).toContain('a2')
    expect(xml).toContain('b1')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-dynamic-reduce-grouped',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Nested array.map (matrix)', async () => {
    const startTime = Date.now()
    const matrix = [
      ['r0c0', 'r0c1', 'r0c2'],
      ['r1c0', 'r1c1', 'r1c2'],
    ]

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="matrix">
          {matrix.map((row, rowIdx) => (
            <Step key={`row-${rowIdx}`} name={`row-${rowIdx}`}>
              {row.map((cell, colIdx) => (
                <Task key={`${rowIdx}-${colIdx}`} done={false}>{cell}</Task>
              ))}
            </Step>
          ))}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="row-0"')
    expect(xml).toContain('name="row-1"')
    expect(xml).toContain('r0c0')
    expect(xml).toContain('r0c2')
    expect(xml).toContain('r1c1')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-nested-array-map-matrix',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, rows: 2, cols: 3 },
      errors: [],
    })
  })

  // ============================================================================
  // Fragment patterns - XML rendering validation
  // ============================================================================

  test('Nested Fragments', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="nested-fragments">
          <Fragment>
            <Fragment>
              <Step name="deeply-nested">Deeply nested in fragments</Step>
            </Fragment>
            <Step name="sibling">Fragment sibling</Step>
          </Fragment>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="deeply-nested"')
    expect(xml).toContain('name="sibling"')
    expect(xml).not.toContain('<fragment')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-nested-fragments',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, fragment_transparent: true },
      errors: [],
    })
  })

  test('Fragment with key in map', async () => {
    const startTime = Date.now()
    const items = ['x', 'y', 'z']

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="keyed-fragments">
          {items.map(item => (
            <Fragment key={item}>
              <Step name={`${item}-step`}>{item} step</Step>
              <Task done={false}>{item} task</Task>
            </Fragment>
          ))}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="x-step"')
    expect(xml).toContain('name="y-step"')
    expect(xml).toContain('name="z-step"')
    expect(xml).toContain('x task')
    expect(xml).toContain('y task')
    expect(xml).toContain('z task')

    const stepCount = (xml.match(/<step/g) || []).length
    expect(stepCount).toBe(3)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-fragment-with-key',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, step_count: stepCount },
      errors: [],
    })
  })

  test('Fragment as only child', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="fragment-only">
          <Fragment>
            <Step name="only-child">Only child in fragment</Step>
          </Fragment>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="only-child"')
    expect(xml).toContain('Only child in fragment')
    expect(xml).not.toContain('<fragment')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-fragment-only-child',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Empty Fragment renders nothing', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="empty-fragment">
          <Fragment />
          <Step name="after-empty">After empty fragment</Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('name="after-empty"')
    expect(xml).not.toContain('<fragment')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-empty-fragment',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  // ============================================================================
  // Performance stress tests - XML rendering validation
  // ============================================================================

  test('Large tree with 500+ nodes renders', async () => {
    const startTime = Date.now()

    // Create 10 phases with 50 steps each = 500+ nodes
    const phases = Array.from({ length: 10 }, (_, i) => `phase-${i}`)
    const stepsPerPhase = Array.from({ length: 50 }, (_, i) => `step-${i}`)

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        {phases.map(phase => (
          <Phase key={phase} name={phase}>
            {stepsPerPhase.map(step => (
              <Step key={`${phase}-${step}`} name={`${phase}-${step}`}>
                Content
              </Step>
            ))}
          </Phase>
        ))}
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    const phaseCount = (xml.match(/<phase/g) || []).length
    const stepCount = (xml.match(/<step/g) || []).length

    expect(phaseCount).toBe(10)
    expect(stepCount).toBe(500)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-large-tree-500-nodes',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        phase_count: phaseCount,
        step_count: stepCount,
        total_nodes: phaseCount + stepCount,
      },
      errors: [],
    })
  })

  test('Mixed composition stress test', async () => {
    const startTime = Date.now()
    const items = Array.from({ length: 20 }, (_, i) => i)

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="stress">
          {items.map(i => (
            <Fragment key={i}>
              {i % 2 === 0 && (
                <Step name={`even-${i}`}>
                  <Parallel>
                    <Task done={false}>Task A-{i}</Task>
                    <Task done={false}>Task B-{i}</Task>
                  </Parallel>
                </Step>
              )}
              {i % 2 === 1 && (
                <Phase name={`odd-phase-${i}`}>
                  <Step name={`odd-step-${i}`}>Odd {i}</Step>
                </Phase>
              )}
            </Fragment>
          ))}
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // 10 even (0,2,4,6,8,10,12,14,16,18) -> 10 steps with parallel
    // 10 odd (1,3,5,7,9,11,13,15,17,19) -> 10 phases with steps
    expect(xml).toContain('name="even-0"')
    expect(xml).toContain('name="odd-phase-1"')
    expect(xml).toContain('Task A-0')
    expect(xml).toContain('Task B-0')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '13-mixed-stress-test',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })
})
