/**
 * Eval 05: Agent Smithers Component
 *
 * Tests Smithers and Subagent components render correct XML structure.
 * Validates XML serialization and prop handling without executing agents.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Smithers } from '../src/components/Smithers'
import { Subagent } from '../src/components/Subagent'
import { validateXML } from './validation/output-validator'

describe('05-agent-smithers', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('agent-smithers')
  })

  afterEach(async () => {
    // Wait for async effects to complete
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('Smithers component renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="agent-test">
          <Smithers>Create a new feature</Smithers>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<smithers-subagent')
    expect(xml).toContain('status=')
    expect(xml).toContain('planner-model=')
    expect(xml).toContain('execution-model=')
    expect(xml).toContain('Create a new feature')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '05-smithers-renders',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
      },
      errors: [],
    })
  })

  test('Smithers with name prop', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="agent-test">
          <Smithers plannerModel="opus" executionModel="sonnet">
            Build a REST API
          </Smithers>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<smithers-subagent')
    expect(xml).toContain('planner-model="opus"')
    expect(xml).toContain('execution-model="sonnet"')
    expect(xml).toContain('Build a REST API')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '05-smithers-with-models',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Smithers with children', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="complex-task">
          <Smithers plannerModel="sonnet">
            Implement user authentication with:
            1. Login endpoint
            2. Signup endpoint
            3. Password hashing
            4. JWT tokens
          </Smithers>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<smithers-subagent')
    expect(xml).toContain('Implement user authentication')
    expect(xml).toContain('Login endpoint')
    expect(xml).toContain('JWT tokens')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '05-smithers-with-children',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Subagent wrapper component renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="subagent-test">
          <Subagent name="researcher">
            Research the topic in depth
          </Subagent>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<subagent')
    expect(xml).toContain('name="researcher"')
    expect(xml).toContain('Research the topic in depth')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '05-subagent-renders',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Subagent with name and parallel props', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="parallel-test">
          <Subagent name="analyzer" parallel={true}>
            Analyze multiple data sources
          </Subagent>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<subagent')
    expect(xml).toContain('name="analyzer"')
    expect(xml).toContain('parallel=')
    expect(xml).toContain('Analyze multiple data sources')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '05-subagent-parallel',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Multiple Smithers agents render', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="multi-agent">
          <Smithers plannerModel="opus">
            Create the frontend
          </Smithers>
          <Smithers plannerModel="sonnet">
            Create the backend
          </Smithers>
          <Subagent name="coordinator" parallel={false}>
            Coordinate between frontend and backend
          </Subagent>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Should contain multiple smithers-subagent elements
    const smithersMatches = xml.match(/<smithers-subagent/g)
    expect(smithersMatches).toBeTruthy()
    expect(smithersMatches?.length).toBe(2)

    // Should contain one subagent element
    expect(xml).toContain('<subagent')
    expect(xml).toContain('name="coordinator"')

    // Should contain all task descriptions
    expect(xml).toContain('Create the frontend')
    expect(xml).toContain('Create the backend')
    expect(xml).toContain('Coordinate between frontend and backend')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '05-multiple-smithers',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        smithers_count: smithersMatches?.length || 0,
      },
      errors: [],
    })
  })
})
