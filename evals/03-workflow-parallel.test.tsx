/**
 * Eval 03: Parallel Workflow Execution
 *
 * Tests concurrent execution with Parallel component.
 * Validates XML structure for parallel execution patterns.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Parallel } from '../src/components/Parallel'
import { validateXML } from './validation/output-validator'

describe('03-workflow-parallel', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('workflow-parallel')
  })

  afterEach(async () => {
    // Wait for async effects to complete
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('Parallel wrapper renders correctly', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Parallel>
            <Step name="step1">Task 1</Step>
          </Parallel>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Validate parallel element exists
    expect(xml).toContain('<parallel')
    expect(xml).toContain('<step')
    expect(xml).toContain('Task 1')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '03-parallel-wrapper-renders',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_parallel_element: xml.includes('<parallel'),
      },
      errors: [],
    })
  })

  test('Multiple steps in parallel', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Parallel>
            <Step name="step1">Task 1</Step>
            <Step name="step2">Task 2</Step>
            <Step name="step3">Task 3</Step>
          </Parallel>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Validate all steps are present
    expect(xml).toContain('name="step1"')
    expect(xml).toContain('name="step2"')
    expect(xml).toContain('name="step3"')
    expect(xml).toContain('Task 1')
    expect(xml).toContain('Task 2')
    expect(xml).toContain('Task 3')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '03-multiple-steps-parallel',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        step_count: 3,
      },
      errors: [],
    })
  })

  test('Step registry isParallel mode', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Parallel>
            <Step name="step1">Task 1</Step>
            <Step name="step2">Task 2</Step>
          </Parallel>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // In parallel mode, steps should all be active (not blocked)
    // Check XML shows both steps are rendered
    const step1Match = xml.match(/<step[^>]*name="step1"[^>]*status="([^"]*)"/)
    const step2Match = xml.match(/<step[^>]*name="step2"[^>]*status="([^"]*)"/)

    expect(step1Match).toBeTruthy()
    expect(step2Match).toBeTruthy()

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '03-step-registry-parallel-mode',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        step1_status: step1Match?.[1],
        step2_status: step2Match?.[1],
      },
      errors: [],
    })
  })

  test('All parallel steps render', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Parallel>
            <Step name="step1">Task 1</Step>
            <Step name="step2">Task 2</Step>
            <Step name="step3">Task 3</Step>
            <Step name="step4">Task 4</Step>
          </Parallel>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Count step elements
    const stepMatches = xml.match(/<step/g)
    const stepCount = stepMatches ? stepMatches.length : 0

    expect(stepCount).toBe(4)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '03-all-parallel-steps-render',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        step_count: stepCount,
        expected_count: 4,
      },
      errors: [],
    })
  })

  test('Parallel inside Phase works', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="build">
          <Parallel>
            <Step name="frontend">Build frontend</Step>
            <Step name="backend">Build backend</Step>
          </Parallel>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Validate structure: phase > parallel > steps
    expect(xml).toContain('<phase')
    expect(xml).toContain('name="build"')
    expect(xml).toContain('<parallel')
    expect(xml).toContain('name="frontend"')
    expect(xml).toContain('name="backend"')
    expect(xml).toContain('Build frontend')
    expect(xml).toContain('Build backend')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '03-parallel-inside-phase',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_phase: xml.includes('<phase'),
        has_parallel: xml.includes('<parallel'),
      },
      errors: [],
    })
  })

  test('Nested parallel structures', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Parallel>
            <Parallel>
              <Step name="step1">Task 1</Step>
              <Step name="step2">Task 2</Step>
            </Parallel>
            <Step name="step3">Task 3</Step>
          </Parallel>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Count parallel elements
    const parallelMatches = xml.match(/<parallel/g)
    const parallelCount = parallelMatches ? parallelMatches.length : 0

    // Should have nested parallel elements
    expect(parallelCount).toBeGreaterThanOrEqual(2)

    // All steps should be present
    expect(xml).toContain('name="step1"')
    expect(xml).toContain('name="step2"')
    expect(xml).toContain('name="step3"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '03-nested-parallel-structures',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        parallel_count: parallelCount,
        step_count: 3,
      },
      errors: [],
    })
  })
})
