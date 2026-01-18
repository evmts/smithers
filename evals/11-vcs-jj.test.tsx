/**
 * Eval 11: JJ VCS Components
 *
 * Tests JJ (Jujutsu) version control system components for XML rendering.
 * Mock mode prevents real JJ execution - focuses on XML structure validation.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Snapshot } from '../src/components/JJ/Snapshot'
import { Commit } from '../src/components/JJ/Commit'
import { Describe } from '../src/components/JJ/Describe'
import { validateXML } from './validation/output-validator'

describe('11-vcs-jj', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('vcs-jj')
  })

  afterEach(async () => {
    // Wait for async effects to complete
    await new Promise(resolve => setTimeout(resolve, 200))
    cleanupTestEnvironment(env)
  })

  test('JJ.Snapshot renders with status attribute', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Snapshot />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-jj-snapshot-renders',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_status: xml.includes('status='),
      },
      errors: [],
    })
  })

  test('JJ.Commit renders with commit attributes', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Commit message="Test commit" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('message="Test commit"')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-jj-commit-renders',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_message: xml.includes('message='),
      },
      errors: [],
    })
  })

  test('JJ.Describe renders with agent and template props', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Describe useAgent="claude" template="conventional" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('use-agent="claude"')
    expect(xml).toContain('template="conventional"')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-jj-describe-renders',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_agent: xml.includes('use-agent='),
      },
      errors: [],
    })
  })

  test('Snapshot with message prop renders correctly', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Snapshot message="Checkpoint before refactor">
            Creating safety checkpoint
          </Snapshot>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('message="Checkpoint before refactor"')
    expect(xml).toContain('Creating safety checkpoint')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-snapshot-with-message',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_message: xml.includes('message='),
        has_children: xml.includes('Creating safety checkpoint'),
      },
      errors: [],
    })
  })

  test('Multiple JJ operations in sequence render', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs-workflow">
          <Snapshot message="Before changes" />
          <Commit message="Implement feature" autoDescribe={true} />
          <Describe useAgent="claude" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('message="Before changes"')
    expect(xml).toContain('message="Implement feature"')
    expect(xml).toContain('auto-describe="true"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-multiple-jj-operations',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        has_snapshot: xml.includes('<jj-snapshot'),
        has_commit: xml.includes('<jj-commit'),
        has_describe: xml.includes('<jj-describe'),
      },
      errors: [],
    })
  })

  test('JJ inside nested Phase renders correctly', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="deployment">
          <Phase name="pre-deploy">
            <Snapshot message="Pre-deployment checkpoint">
              Creating checkpoint before deployment
            </Snapshot>
          </Phase>
          <Phase name="commit">
            <Commit message="Deploy changes" autoDescribe={true}>
              Deploying to production
            </Commit>
          </Phase>
          <Phase name="describe">
            <Describe useAgent="claude" template="conventional" />
          </Phase>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('<phase name="deployment"')
    expect(xml).toContain('<phase name="pre-deploy"')
    expect(xml).toContain('<phase name="commit"')
    expect(xml).toContain('<phase name="describe"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-jj-inside-phase',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        nested_correctly: xml.includes('<phase') && xml.includes('<jj-'),
        has_auto_describe: xml.includes('auto-describe='),
      },
      errors: [],
    })
  })
})
