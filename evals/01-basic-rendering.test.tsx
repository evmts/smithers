/**
 * Eval 01: Basic Component Rendering
 *
 * Tests that all major components render correct XML structure with props.
 * Validates XML serialization, prop handling, and special character escaping.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Claude } from '../src/components/Claude'
import { Stop } from '../src/components/Stop'
import { Human } from '../src/components/Human'
import { Task } from '../src/components/Task'
import { Persona } from '../src/components/Persona'
import { Constraints } from '../src/components/Constraints'
import { Subagent } from '../src/components/Subagent'
import { validateXML } from './validation/output-validator'

describe('01-basic-rendering', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('basic-rendering')
  })

  afterEach(async () => {
    // Wait for async effects to complete
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('Phase renders with name and status attributes', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="research">
          <Step name="gather">Gather information</Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<phase name="research"')
    expect(xml).toContain('status=')
    expect(xml).toContain('<step')
    expect(xml).toContain('Gather information')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-phase-renders',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
      },
      errors: [],
    })
  })

  test('Step renders with name and children as text', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Step name="install">Run npm install</Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<step')
    expect(xml).toContain('name="install"')
    expect(xml).toContain('Run npm install')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-step-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Claude renders with model prop', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="code">
          <Claude model="opus">Write a function</Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    expect(xml).toContain('model="opus"')
    expect(xml).toContain('Write a function')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-claude-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Stop renders with reason', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="done">
          <Stop reason="Completed successfully" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<smithers-stop')
    expect(xml).toContain('reason="Completed successfully"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-stop-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Human renders message', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="approval">
          <Human message="Please review the plan" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<human')
    expect(xml).toContain('Please review the plan')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-human-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Task renders with done boolean', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="work">
          <Task done={false}>Write tests</Task>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<task')
    expect(xml).toContain('Write tests')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-task-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Persona renders role', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="setup">
          <Persona role="expert software engineer">Build the app</Persona>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<persona')
    expect(xml).toContain('role="expert software engineer"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-persona-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Constraints renders children', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="work">
          <Constraints>
            - Use TypeScript
            - Follow best practices
          </Constraints>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<constraints')
    expect(xml).toContain('Use TypeScript')
    expect(xml).toContain('Follow best practices')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-constraints-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Subagent renders with name and parallel props', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="delegate">
          <Subagent name="researcher" parallel={false}>
            Research the topic
          </Subagent>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<subagent')
    expect(xml).toContain('name="researcher"')
    expect(xml).toContain('Research the topic')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '01-subagent-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('XML special characters are properly escaped', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="special&chars">
          <Step name='test"quotes'>
            Text with {"<"} and {">"} and {"&"} and {'"'} and {"'"}
          </Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Should be escaped but not double-escaped
    expect(xml).not.toContain('&amp;amp;')
    expect(xml).not.toContain('&amp;lt;')
    expect(xml).not.toContain('&amp;gt;')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)

    logEvalResult({
      test: '01-special-chars-escaped',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        no_double_escaping: !xml.includes('&amp;amp;'),
      },
      errors: [],
    })
  })
})
