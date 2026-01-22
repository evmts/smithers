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
          <Snapshot message="Pre-deployment checkpoint">
            Creating checkpoint before deployment
          </Snapshot>
          <Commit message="Deploy changes" autoDescribe={true}>
            Deploying to production
          </Commit>
          <Describe useAgent="claude" template="conventional" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Should contain phase with jj operations
    expect(xml).toContain('<phase name="deployment"')
    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('message="Deploy changes"')

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

  // ============================================================================
  // JJ.Snapshot tests - XML rendering validation
  // ============================================================================

  test('Snapshot without message', async () => {
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

    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-snapshot-without-message',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Snapshot with id prop for resumability', async () => {
    const startTime = Date.now()
    const stableId = 'my-snapshot-id'

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Snapshot id={stableId} message="checkpoint">
            Snapshot with stable ID
          </Snapshot>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('status=')
    expect(xml).toContain('message="checkpoint"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-snapshot-with-id',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, stable_id: stableId },
      errors: [],
    })
  })

  test('Snapshot with children content', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Snapshot message="pre-refactor">
            Taking a snapshot before major refactoring work
          </Snapshot>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('Taking a snapshot before major refactoring work')
    expect(xml).toContain('message="pre-refactor"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-snapshot-with-children',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  // ============================================================================
  // JJ.Commit tests - XML rendering validation
  // ============================================================================

  test('Commit with autoDescribe=false', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Commit message="manual message" autoDescribe={false}>
            Manual commit without auto-describe
          </Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('message="manual message"')
    expect(xml).toContain('auto-describe="false"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-commit-auto-describe-false',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Commit with id prop for resumability', async () => {
    const startTime = Date.now()
    const stableId = 'my-jj-commit-id'

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Commit id={stableId} message="stable commit">
            JJ commit with stable ID
          </Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('message="stable commit"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-commit-with-id',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, stable_id: stableId },
      errors: [],
    })
  })

  test('Commit with notes prop', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Commit message="commit with notes" notes="Review metadata attached">
            Commit with notes metadata
          </Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('message="commit with notes"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-commit-with-notes',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Commit without message (default)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Commit>
            Commit without explicit message
          </Commit>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-commit-no-message',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  // ============================================================================
  // JJ.Describe tests - XML rendering validation
  // ============================================================================

  test('Describe without useAgent (manual)', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Describe>
            Manual description without agent
          </Describe>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-describe-no-agent',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Describe with custom template', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Describe template="detailed">
            Describe with detailed template
          </Describe>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('template="detailed"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-describe-custom-template',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Describe with id prop for resumability', async () => {
    const startTime = Date.now()
    const stableId = 'my-describe-id'

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Describe id={stableId} useAgent="claude">
            Describe with stable ID
          </Describe>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('use-agent="claude"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-describe-with-id',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true, stable_id: stableId },
      errors: [],
    })
  })

  test('Describe with both agent and template', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="vcs">
          <Describe useAgent="claude" template="brief">
            Using agent with brief template
          </Describe>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('use-agent="claude"')
    expect(xml).toContain('template="brief"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-describe-agent-and-template',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  // ============================================================================
  // Integration scenarios - XML rendering validation
  // ============================================================================

  test('Snapshot then Commit workflow', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="jj-workflow">
          <Snapshot message="Before changes" />
          <Commit message="Apply changes" autoDescribe={true} />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('message="Before changes"')
    expect(xml).toContain('message="Apply changes"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-snapshot-then-commit',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Commit with autoDescribe agent flow', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="auto-describe">
          <Commit autoDescribe={true}>
            Agent will generate commit message
          </Commit>
          <Describe useAgent="claude" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('auto-describe="true"')
    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('use-agent="claude"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-commit-auto-describe-flow',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Multiple JJ operations render correctly', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="multi-jj">
          <Snapshot message="checkpoint 1" />
          <Commit message="commit 1" />
          <Snapshot message="checkpoint 2" />
          <Commit message="commit 2" />
          <Describe useAgent="claude" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    const snapshotCount = (xml.match(/<jj-snapshot/g) || []).length
    const commitCount = (xml.match(/<jj-commit/g) || []).length
    const describeCount = (xml.match(/<jj-describe/g) || []).length

    expect(snapshotCount).toBe(2)
    expect(commitCount).toBe(2)
    expect(describeCount).toBe(1)

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-multiple-jj-operations',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        snapshot_count: snapshotCount,
        commit_count: commitCount,
        describe_count: describeCount,
      },
      errors: [],
    })
  })

  test('JJ mock mode renders pending status', async () => {
    const startTime = Date.now()

    // Mock mode is enabled by default in test env
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="mock-test">
          <Snapshot message="mock snapshot" />
          <Commit message="mock commit" />
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('status=')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-jj-mock-mode',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })

  test('Full JJ workflow: Snapshot -> Commit -> Describe', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="full-workflow">
          <Snapshot message="Initial state">
            Capture working directory state
          </Snapshot>
          <Commit message="Implement feature" autoDescribe={false}>
            Feature implementation complete
          </Commit>
          <Describe useAgent="claude" template="conventional">
            Generate conventional commit description
          </Describe>
        </Phase>
      </SmithersProvider>
    )

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    expect(xml).toContain('<jj-snapshot')
    expect(xml).toContain('<jj-commit')
    expect(xml).toContain('<jj-describe')
    expect(xml).toContain('Capture working directory state')
    expect(xml).toContain('Feature implementation complete')
    expect(xml).toContain('Generate conventional commit description')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    logEvalResult({
      test: '11-full-jj-workflow',
      passed: true,
      duration_ms: duration,
      structured_output: { xml_valid: true },
      errors: [],
    })
  })
})
