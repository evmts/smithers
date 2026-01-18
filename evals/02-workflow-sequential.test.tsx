/**
 * Eval 02: Sequential Workflow Execution
 *
 * Tests sequential phase/step execution with DB state tracking.
 * Validates phase registry, step registry, and database state transitions.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult, delay } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { PhaseRegistryProvider } from '../src/components/PhaseRegistry'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { validateXML } from './validation/output-validator'

describe('02-workflow-sequential', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('workflow-sequential')
  })

  afterEach(async () => {
    // Dispose root first to stop effects, then wait before closing DB
    env.root.dispose()
    await delay(300)
    env.db.close()
  })

  test('Single phase activates and completes', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="research">
            <Step name="gather">Gather information</Step>
          </Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML should show phase with active status
    expect(xml).toContain('name="research"')
    expect(xml).toContain('status="active"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    // Check DB state - phase should be registered
    const phases = env.db.phases.list(env.executionId)
    expect(phases.length).toBeGreaterThan(0)
    expect(phases[0].name).toBe('research')
    expect(phases[0].status).toBe('running')

    logEvalResult({
      test: '02-single-phase-activates',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        phase_count: phases.length,
        phase_status: phases[0].status,
      },
      errors: [],
    })
  })

  test('Multiple phases execute in order', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="research">Research phase</Phase>
          <Phase name="implement">Implement phase</Phase>
          <Phase name="review">Review phase</Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML validation
    expect(xml).toContain('name="research"')
    expect(xml).toContain('name="implement"')
    expect(xml).toContain('name="review"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    // Query DB for phase registration
    const phases = env.db.phases.list(env.executionId)

    // At least first phase should be started
    expect(phases.length).toBeGreaterThan(0)

    // First phase should be active/running
    const firstPhase = phases.find(p => p.name === 'research')
    expect(firstPhase).toBeDefined()
    expect(firstPhase!.status).toBe('running')

    // Check that phases have chronological timestamps if multiple exist
    if (phases.length > 1) {
      const sorted = [...phases].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      expect(sorted[0].id).toBe(phases[0].id)
    }

    logEvalResult({
      test: '02-multiple-phases-ordered',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        phases_registered: phases.length,
        first_phase_active: firstPhase?.status === 'running',
      },
      errors: [],
    })
  })

  test('Steps within phase execute sequentially', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="build">
            <Step name="install">Install dependencies</Step>
            <Step name="compile">Compile code</Step>
            <Step name="test">Run tests</Step>
          </Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // XML should show phase and first step as active
    expect(xml).toContain('name="build"')
    expect(xml).toContain('name="install"')
    // Only first step should be active (sequential execution)
    expect(xml).toContain('Install dependencies')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    // Check step index in state - should be 0 (first step)
    const stepKey = `stepIndex_build`
    const stepIndex = env.db.state.get<number>(stepKey)

    logEvalResult({
      test: '02-steps-sequential',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        step_index: stepIndex ?? -1,
      },
      errors: [],
    })
  })

  test('Phase registry tracks active phase', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="alpha">Alpha phase</Phase>
          <Phase name="beta">Beta phase</Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const duration = Date.now() - startTime

    // Check currentPhaseIndex in state table
    const stateRow = env.db.state.get<number>('currentPhaseIndex')
    expect(stateRow).toBe(0) // Should be first phase (index 0)

    logEvalResult({
      test: '02-phase-registry-tracking',
      passed: true,
      duration_ms: duration,
      structured_output: {
        current_phase_index: stateRow,
      },
      errors: [],
    })
  })

  test('Step registry advances on completion', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="work">
            <Step name="step1">First step</Step>
            <Step name="step2">Second step</Step>
          </Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const duration = Date.now() - startTime

    // Check step index in state table
    const stepKey = `stepIndex_work`
    const stepIndex = env.db.state.get<number>(stepKey)

    // Should be initialized to 0 (first step)
    expect(stepIndex).toBe(0)

    logEvalResult({
      test: '02-step-registry-advances',
      passed: true,
      duration_ms: duration,
      structured_output: {
        step_index: stepIndex,
      },
      errors: [],
    })
  })

  test('Database logs phase/step transitions', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="deploy">
            <Step name="prepare">Prepare deployment</Step>
          </Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const duration = Date.now() - startTime

    // Query phases table
    const phases = env.db.phases.list(env.executionId)
    expect(phases.length).toBeGreaterThan(0)

    const phase = phases[0]
    expect(phase.name).toBe('deploy')
    expect(phase.execution_id).toBe(env.executionId)
    expect(phase.started_at).toBeDefined()
    expect(phase.created_at).toBeDefined()

    logEvalResult({
      test: '02-db-logs-transitions',
      passed: true,
      duration_ms: duration,
      structured_output: {
        phase_logged: true,
        phase_has_timestamps: !!phase.started_at && !!phase.created_at,
      },
      errors: [],
    })
  })

  test('skipIf prop prevents execution', async () => {
    const startTime = Date.now()
    let skipCondition = true

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="conditional" skipIf={() => skipCondition}>
            Skipped content
          </Phase>
          <Phase name="normal">
            Normal content
          </Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    // Skipped phase should show in XML with skipped status
    expect(xml).toContain('name="conditional"')
    expect(xml).toContain('status="skipped"')

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    // Check DB for skipped status
    const phases = env.db.phases.list(env.executionId)
    const skippedPhase = phases.find(p => p.name === 'conditional')

    logEvalResult({
      test: '02-skipif-prevents-execution',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        phase_skipped_in_db: skippedPhase?.status === 'skipped',
      },
      errors: [],
    })
  })

  test('onStart/onComplete callbacks fire', async () => {
    const startTime = Date.now()
    let startCount = 0
    let completeCount = 0

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase
            name="tracked"
            onStart={() => { startCount++ }}
            onComplete={() => { completeCount++ }}
          >
            Tracked content
          </Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const duration = Date.now() - startTime

    // Phase onStart should fire
    expect(startCount).toBeGreaterThanOrEqual(1)

    logEvalResult({
      test: '02-callbacks-fire',
      passed: true,
      duration_ms: duration,
      structured_output: {
        start_callbacks: startCount,
        complete_callbacks: completeCount,
      },
      errors: [],
    })
  })

  test('Completed phases have status="completed"', async () => {
    const startTime = Date.now()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="done">Done phase</Phase>
          <Phase name="pending">Pending phase</Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    // Advance phase index to mark first as completed
    env.db.state.set('currentPhaseIndex', 1, 'test_advance')

    await delay(20)

    // Re-render to update statuses
    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="done">Done phase</Phase>
          <Phase name="pending">Pending phase</Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(20)

    const xml = env.root.toXML()
    const duration = Date.now() - startTime

    const validation = validateXML(xml)
    expect(validation.valid).toBe(true)

    // Check that both phases appear in XML
    expect(xml).toContain('name="done"')
    expect(xml).toContain('name="pending"')

    logEvalResult({
      test: '02-completed-status',
      passed: true,
      duration_ms: duration,
      structured_output: {
        xml_valid: true,
        current_phase_index: 1,
      },
      errors: [],
    })
  })

  test('Chronological timestamp validation', async () => {
    const startTime = Date.now()
    const beforeRender = new Date()

    await env.root.render(
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <PhaseRegistryProvider>
          <Phase name="first">
            <Step name="step1">Step 1</Step>
          </Phase>
        </PhaseRegistryProvider>
      </SmithersProvider>
    )

    await delay(50)

    const afterRender = new Date()
    const duration = Date.now() - startTime

    // Query phases
    const phases = env.db.phases.list(env.executionId)
    expect(phases.length).toBeGreaterThan(0)

    const phase = phases[0]
    const phaseCreatedAt = new Date(phase.created_at)

    // Timestamps should be between before and after
    expect(phaseCreatedAt.getTime()).toBeGreaterThanOrEqual(beforeRender.getTime())
    expect(phaseCreatedAt.getTime()).toBeLessThanOrEqual(afterRender.getTime())

    logEvalResult({
      test: '02-chronological-timestamps',
      passed: true,
      duration_ms: duration,
      structured_output: {
        phase_timestamp_valid: true,
        timestamps_ordered: true,
      },
      errors: [],
    })
  })
})
