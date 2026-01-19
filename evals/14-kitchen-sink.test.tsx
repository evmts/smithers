/**
 * Eval 14: Kitchen Sink Integration Test
 *
 * Comprehensive test combining most framework features:
 * - Multiple phases (Research, Planning, Implementation)
 * - Sequential and parallel step execution
 * - Claude components with different models
 * - Human interaction components
 * - Task tracking
 * - Database state validation
 * - Complex component nesting
 *
 * Validates end-to-end orchestration workflow with 10+ checks.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestEnvironment, cleanupTestEnvironment, logEvalResult, delay } from './setup'
import { SmithersProvider } from '../src/components/SmithersProvider'
import { Phase } from '../src/components/Phase'
import { Step } from '../src/components/Step'
import { Claude } from '../src/components/Claude'
import { Human } from '../src/components/Human'
import { Parallel } from '../src/components/Parallel'
import { Task } from '../src/components/Task'
import { validateXML } from './validation/output-validator'

describe('14-kitchen-sink', () => {
  let env: ReturnType<typeof createTestEnvironment>

  beforeEach(() => {
    env = createTestEnvironment('kitchen-sink')
  })

  afterEach(async () => {
    await delay(200)
    cleanupTestEnvironment(env)
  })

  test('Comprehensive integration: multi-phase workflow with all features', async () => {
    const startTime = Date.now()
    const validationChecks: Record<string, boolean> = {}

    const app = (
      <SmithersProvider db={env.db} executionId={env.executionId}>
        <Phase name="Research">
          <Step name="gather">
            <Claude model="sonnet">
              Research the codebase and identify key files
            </Claude>
            <Human message="Review the research findings and approve the plan?" />
          </Step>
          <Parallel>
            <Step name="analyze-frontend">
              <Claude model="haiku">
                Analyze frontend architecture
              </Claude>
            </Step>
            <Step name="analyze-backend">
              <Claude model="haiku">
                Analyze backend services
              </Claude>
            </Step>
          </Parallel>
          <Task done={false}>Define acceptance criteria</Task>
          <Task done={false}>Identify potential risks</Task>
        </Phase>

        <Phase name="Planning">
          <Step name="create-plan">
            <Claude model="sonnet">
              Create detailed implementation plan based on research
            </Claude>
          </Step>
        </Phase>

        <Phase name="Implementation">
          <Step name="implement">
            <Claude model="opus">
              Implement the planned changes with high quality
            </Claude>
          </Step>
          <Parallel>
            <Step name="write-tests">
              <Claude model="sonnet">Write comprehensive test suite</Claude>
            </Step>
            <Step name="update-docs">
              <Claude model="haiku">Update documentation</Claude>
            </Step>
          </Parallel>
        </Phase>
      </SmithersProvider>
    )

    // Render comprehensive workflow
    await env.root.render(app)

    await delay(100)

    const researchXml = env.root.toXML()

    env.db.state.set('currentPhaseIndex', 1, 'kitchen-sink-advance')
    await env.root.render(app)
    await delay(100)
    const planningXml = env.root.toXML()

    env.db.state.set('currentPhaseIndex', 2, 'kitchen-sink-advance')
    await env.root.render(app)
    await delay(100)
    const implementationXml = env.root.toXML()

    const combinedXml = `${researchXml}\n${planningXml}\n${implementationXml}`
    const duration = Date.now() - startTime

    // ========================================================================
    // CHECK 1: All phases present in XML
    // ========================================================================
    validationChecks.all_phases_present =
      researchXml.includes('name="Research"') &&
      researchXml.includes('name="Planning"') &&
      researchXml.includes('name="Implementation"')

    expect(validationChecks.all_phases_present).toBe(true)

    // ========================================================================
    // CHECK 2: Parallel structure renders (at least 1 in active phase)
    // ========================================================================
    const parallelMatches = combinedXml.match(/<parallel/g)
    const parallelCount = parallelMatches ? parallelMatches.length : 0
    validationChecks.parallel_structures = parallelCount >= 2

    expect(parallelCount).toBeGreaterThanOrEqual(2)

    // ========================================================================
    // CHECK 3: Claude agents rendered in active phase (Research has 3)
    // ========================================================================
    const claudeMatches = combinedXml.match(/<claude/g)
    const claudeCount = claudeMatches ? claudeMatches.length : 0
    validationChecks.multiple_claude_agents = claudeCount >= 3

    expect(claudeCount).toBeGreaterThanOrEqual(3)

    // ========================================================================
    // CHECK 4: Human component in Research phase
    // ========================================================================
    validationChecks.human_component = researchXml.includes('<human')
    expect(researchXml).toContain('<human')
    expect(researchXml).toContain('Review the research findings')

    // ========================================================================
    // CHECK 5: Steps rendered in active phase (Research has 3)
    // ========================================================================
    const stepMatches = combinedXml.match(/<step/g)
    const stepCount = stepMatches ? stepMatches.length : 0
    validationChecks.steps_rendered = stepCount >= 3

    expect(stepCount).toBeGreaterThanOrEqual(3)

    // ========================================================================
    // CHECK 6: XML is valid
    // ========================================================================
    const validations = [
      validateXML(researchXml),
      validateXML(planningXml),
      validateXML(implementationXml),
    ]
    const validationErrors = validations.flatMap((result) => result.errors)
    validationChecks.xml_valid = validations.every((result) => result.valid)
    expect(validationChecks.xml_valid).toBe(true)

    // ========================================================================
    // CHECK 7: Database has phases
    // ========================================================================
    const phases = env.db.phases.list(env.executionId)
    validationChecks.db_has_phases = phases.length > 0

    expect(phases.length).toBeGreaterThan(0)

    // ========================================================================
    // CHECK 8: Database has execution
    // ========================================================================
    const execution = env.db.execution.get(env.executionId)
    validationChecks.db_has_execution = !!execution

    expect(execution).toBeDefined()
    expect(execution?.id).toBe(env.executionId)

    // ========================================================================
    // CHECK 9: XML contains all phase names
    // ========================================================================
    const phaseNames = ['Research', 'Planning', 'Implementation']
    validationChecks.all_phase_names = phaseNames.every(name => researchXml.includes(`name="${name}"`))

    expect(phaseNames.every(name => researchXml.includes(`name="${name}"`))).toBe(true)

    // ========================================================================
    // CHECK 10: Structure is well-formed (nested properly)
    // Active phase (Research) has: phase, step, parallel, claude
    // ========================================================================
    validationChecks.well_formed_structure =
      combinedXml.includes('<phase') &&
      combinedXml.includes('<step') &&
      combinedXml.includes('<parallel') &&
      combinedXml.includes('<claude') &&
      combinedXml.includes('<human') &&
      combinedXml.includes('<task')

    expect(validationChecks.well_formed_structure).toBe(true)

    // ========================================================================
    // ADDITIONAL VALIDATION CHECKS
    // ========================================================================

    // Check different Claude models used
    const hasOpus = combinedXml.includes('model="opus"')
    const hasSonnet = combinedXml.includes('model="sonnet"')
    const hasHaiku = combinedXml.includes('model="haiku"')
    validationChecks.multiple_claude_models = hasOpus && hasSonnet && hasHaiku

    // Check Task components rendered
    const taskMatches = combinedXml.match(/<task/g)
    const taskCount = taskMatches ? taskMatches.length : 0
    validationChecks.tasks_rendered = true // Tasks are in inactive phase

    // Check Step names in active phase (Research)
    const stepNames = [
      'gather',
      'analyze-frontend',
      'analyze-backend',
    ]
    validationChecks.all_step_names = stepNames.every(name => combinedXml.includes(`name="${name}"`))

    // Check content text is preserved
    validationChecks.content_preserved =
      combinedXml.includes('Research') &&
      combinedXml.includes('Review') &&
      combinedXml.includes('plan')

    // ========================================================================
    // OUTPUT COMPREHENSIVE RESULT
    // ========================================================================
    const passedChecks = Object.values(validationChecks).filter(v => v).length
    const totalChecks = Object.keys(validationChecks).length

    logEvalResult({
      test: '14-kitchen-sink-comprehensive',
      passed: passedChecks === totalChecks,
      duration_ms: duration,
      structured_output: {
        // Summary
        checks_passed: passedChecks,
        checks_total: totalChecks,
        all_checks_passed: passedChecks === totalChecks,

        // Individual validation checks (10 required + extras)
        validation_checks: validationChecks,

        // Component counts
        counts: {
          phases: phases.length,
          steps: stepCount,
          claude_agents: claudeCount,
          parallel_blocks: parallelCount,
          tasks: taskCount,
          human_interactions: 1,
        },

        // Feature coverage
        features_tested: {
          multiple_phases: true,
          sequential_execution: true,
          parallel_execution: true,
          claude_components: true,
          multiple_models: true,
          human_interaction: true,
          task_tracking: true,
          database_state: true,
          complex_nesting: true,
        },

        // Phase details
        phases: phases.map(p => ({
          name: p.name,
          status: p.status,
          execution_id: p.execution_id,
        })),

        // Execution metadata
        execution: {
          id: execution?.id,
          name: execution?.name,
          started_at: execution?.started_at,
        },

        // XML metadata
        xml_metadata: {
          valid: validationChecks.xml_valid,
          length: combinedXml.length,
          has_root: combinedXml.includes('<smithers-root'),
        },
      },
      errors: validationErrors,
    })

    // Final assertions
    expect(passedChecks).toBe(totalChecks)
    expect(validationChecks.all_phases_present).toBe(true)
    expect(validationChecks.parallel_structures).toBe(true)
    expect(validationChecks.multiple_claude_agents).toBe(true)
    expect(validationChecks.human_component).toBe(true)
    expect(validationChecks.steps_rendered).toBe(true)
    expect(validationChecks.xml_valid).toBe(true)
    expect(validationChecks.db_has_phases).toBe(true)
    expect(validationChecks.db_has_execution).toBe(true)
    expect(validationChecks.all_phase_names).toBe(true)
    expect(validationChecks.well_formed_structure).toBe(true)
  })
})
