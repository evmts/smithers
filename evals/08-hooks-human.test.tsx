/**
 * Eval 08: Human Hook and Component
 *
 * Tests Human component rendering and useHuman hook basic functionality.
 * Focuses on XML validation - does not test complex async interaction flow.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Human } from '../src/components/Human'
import { validateXML } from './validation/output-validator'

describe('08-hooks-human', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('hooks-human')
  })

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('Human component renders with message prop', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="approval">
          <Human message="Please review and approve" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<human')
    expect(xml).toContain('message="Please review and approve"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '08-human-message-prop',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Human renders children text', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="review">
          <Human>This is the plan we will execute</Human>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<human')
    expect(xml).toContain('This is the plan we will execute')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '08-human-children-text',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Human with message and children', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="confirm">
          <Human message="Should we proceed with deployment?">
            Deployment will affect production systems
          </Human>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<human')
    expect(xml).toContain('message="Should we proceed with deployment?"')
    expect(xml).toContain('Deployment will affect production systems')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '08-human-message-and-children',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Human with only children (no message)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="choice">
          <Human>Choose where to deploy: staging, production, or cancel</Human>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<human')
    expect(xml).toContain('Choose where to deploy: staging, production, or cancel')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '08-human-children-only',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Multiple Human components render', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="multi-approval">
          <Human message="First approval needed">Step 1 complete</Human>
          <Human message="Second approval needed">Step 2 complete</Human>
          <Human message="Final approval">All steps done</Human>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('First approval needed')
    expect(xml).toContain('Second approval needed')
    expect(xml).toContain('Final approval')
    expect(xml).toContain('Step 1 complete')
    expect(xml).toContain('Step 2 complete')
    expect(xml).toContain('All steps done')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '08-multiple-humans',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Human inside Phase renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="workflow">
          <Phase name="preparation">
            <Human message="Review preparation">Prep phase complete</Human>
          </Phase>
          <Phase name="execution">
            <Human message="Review execution">Execution phase complete</Human>
          </Phase>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<phase name="workflow"')
    expect(xml).toContain('<phase name="preparation"')
    expect(xml).toContain('<phase name="execution"')
    expect(xml).toContain('status="pending"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '08-human-in-phase',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })
})
