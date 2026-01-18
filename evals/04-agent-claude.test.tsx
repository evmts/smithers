/**
 * Eval 04: Agent Claude Component
 *
 * Tests Claude component rendering, prop serialization, and XML structure.
 * SMITHERS_MOCK_MODE prevents actual execution - focuses on component interface.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Claude } from '../src/components/Claude'
import { validateXML } from './validation/output-validator'

describe('04-agent-claude', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('agent-claude')
  })

  afterEach(async () => {
    // Wait for async effects to complete
    await new Promise(resolve => setTimeout(resolve, 300))
    // Unmount root before cleaning up DB
    if (env.root) {
      env.root.dispose()
    }
    // Wait a bit more for disposal to complete
    await new Promise(resolve => setTimeout(resolve, 100))
    // Close database last
    if (env.db) {
      env.db.close()
    }
  })

  test('Claude renders with default props', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Claude>Write a hello world function</Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Verify basic Claude element
    expect(xml).toContain('<claude')
    expect(xml).toContain('status=')
    expect(xml).toContain('model="sonnet"') // default model
    expect(xml).toContain('Write a hello world function')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-default-props',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_default_model: xml.includes('model="sonnet"'),
      },
      errors: [],
    })
  })

  test('model="opus" prop renders in XML', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Claude model="opus">Implement feature X</Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    expect(xml).toContain('model="opus"')
    expect(xml).not.toContain('model="sonnet"')
    expect(xml).toContain('Implement feature X')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-model-opus',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        model_value: 'opus',
      },
      errors: [],
    })
  })

  test('maxTurns prop renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Claude maxTurns={10}>Execute task with turn limit</Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    expect(xml).toContain('Execute task with turn limit')
    // maxTurns doesn't appear in XML - it's execution config, not rendered
    // Just verify component renders properly

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-max-turns',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        prop_accepted: true,
      },
      errors: [],
    })
  })

  test('systemPrompt prop present', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Claude systemPrompt="You are a helpful coding assistant">
            Write unit tests
          </Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    expect(xml).toContain('Write unit tests')
    // systemPrompt is execution config, not in XML output

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-system-prompt',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        system_prompt_prop: true,
      },
      errors: [],
    })
  })

  test('onFinished callback prop exists (mock mode)', async () => {
    const startTime = Date.now()
    let callbackInvoked = false
    const onFinished = () => {
      callbackInvoked = true
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Claude onFinished={onFinished}>Complete this task</Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    expect(xml).toContain('Complete this task')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-on-finished-callback',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        callback_prop_accepted: true,
        // In mock mode, callback won't fire
        callback_invoked: callbackInvoked,
      },
      errors: [],
    })
  })

  test('onError callback prop exists', async () => {
    const startTime = Date.now()
    let errorCaptured: Error | null = null
    const onError = (err: Error) => {
      errorCaptured = err
    }

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Claude onError={onError}>Task that might fail</Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    expect(xml).toContain('Task that might fail')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-on-error-callback',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        error_callback_prop_accepted: true,
        error_captured: errorCaptured !== null,
      },
      errors: [],
    })
  })

  test('Multiple Claude components render sequentially', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="multi-agent">
          <Claude model="sonnet">First task</Claude>
          <Claude model="opus">Second task</Claude>
          <Claude model="haiku">Third task</Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Count claude elements
    const claudeMatches = xml.match(/<claude/g)
    expect(claudeMatches).toBeTruthy()
    expect(claudeMatches!.length).toBe(3)

    expect(xml).toContain('First task')
    expect(xml).toContain('Second task')
    expect(xml).toContain('Third task')
    expect(xml).toContain('model="sonnet"')
    expect(xml).toContain('model="opus"')
    expect(xml).toContain('model="haiku"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-multiple-sequential',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        claude_count: 3,
        models: ['sonnet', 'opus', 'haiku'],
      },
      errors: [],
    })
  })

  test('Claude inside Phase/Step renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="research">
          <Step name="gather-info">
            <Claude model="sonnet">Research the topic</Claude>
          </Step>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<phase')
    expect(xml).toContain('name="research"')
    expect(xml).toContain('<step')
    expect(xml).toContain('name="gather-info"')
    expect(xml).toContain('<claude')
    expect(xml).toContain('Research the topic')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-nested-in-step',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        nested_structure: true,
      },
      errors: [],
    })
  })

  test('Claude with children text renders', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="test">
          <Claude model="sonnet">
            This is a multi-line prompt
            with various instructions
            and formatting preserved
          </Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<claude')
    expect(xml).toContain('This is a multi-line prompt')
    expect(xml).toContain('with various instructions')
    expect(xml).toContain('and formatting preserved')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '04-claude-multiline-children',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        multiline_content: true,
      },
      errors: [],
    })
  })

  test('XML structure valid', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="validation">
          <Claude
            model="opus"
            maxTurns={5}
            systemPrompt="Be concise"
          >
            Validate this XML structure
          </Claude>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)

    // Check no double-escaping
    expect(xml).not.toContain('&amp;amp;')
    expect(xml).not.toContain('&amp;lt;')
    expect(xml).not.toContain('&amp;gt;')

    // Verify structure
    expect(xml).toContain('<claude')
    expect(xml).toContain('</claude>')
    expect(xml).toContain('<phase')
    expect(xml).toContain('</phase>')

    logEvalResult({
      test: '04-claude-xml-structure-valid',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        no_double_escaping: true,
        has_closing_tags: true,
        validation_errors: validation.errors,
      },
      errors: [],
    })
  })
})
