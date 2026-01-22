#!/usr/bin/env bun
/** @jsxImportSource smithers-orchestrator */
/**
 * ============================================================================
 * SMITHERS INTERACTIVE DEMO
 * ============================================================================
 *
 * This demo teaches you Smithers fundamentals:
 *   - Claude: AI agent component
 *   - Phase: Sequential workflow stages
 *   - Step: Ordered tasks within phases
 *   - Parallel: Concurrent execution
 *   - Schema: Structured output validation
 *   - db.state: Persistent key-value store
 *
 * Each section runs incrementally with output shown.
 * Total runtime: ~1-2 minutes
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY environment variable
 *   - bun runtime
 * ============================================================================
 */

import { createSmithersRoot } from 'smithers-orchestrator'
import { createSmithersDB } from 'smithers-orchestrator/db'
import {
  Ralph,
  SmithersProvider,
  Claude,
  Phase,
  Step,
  Parallel,
} from 'smithers-orchestrator/components'
import { z } from 'zod'

// ============================================================================
// SECTION 1: DATABASE SETUP
// ============================================================================
// Smithers uses SQLite for ALL state. No useState, no Zustand.
// This enables: persistence, time-travel debugging, crash recovery.

console.log('\n' + '='.repeat(60))
console.log('SMITHERS DEMO - Section 1: Database Setup')
console.log('='.repeat(60))
console.log('\nCreating in-memory SQLite database...')

const db = await createSmithersDB({
  path: ':memory:', // Use in-memory for demo (use '.smithers/data' for persistence)
})

// Start execution tracking
const executionId = await db.execution.start(
  'SmithersDemo',
  'SmithersDemo.tsx',
  { maxIterations: 3, model: 'haiku' }
)

console.log('Database initialized!')
console.log(`Execution ID: ${executionId}`)

// ============================================================================
// SECTION 2: STATE PERSISTENCE
// ============================================================================
// db.state is a key-value store backed by SQLite.
// All state changes are logged to the transitions table for auditing.

console.log('\n' + '='.repeat(60))
console.log('Section 2: State Persistence (db.state)')
console.log('='.repeat(60))

// Set some state
db.state.set('demo_counter', 0)
db.state.set('demo_config', { model: 'haiku', maxTokens: 1000 })

console.log('\nState operations:')
console.log('  db.state.set("demo_counter", 0)')
console.log('  db.state.set("demo_config", { model: "haiku", maxTokens: 1000 })')

// Read state back
const counter = db.state.get<number>('demo_counter')
const config = db.state.get<{ model: string; maxTokens: number }>('demo_config')

console.log('\nReading state:')
console.log(`  demo_counter: ${counter}`)
console.log(`  demo_config: ${JSON.stringify(config)}`)

// Increment counter
db.state.set('demo_counter', (counter ?? 0) + 1)
console.log(`\nAfter increment: ${db.state.get('demo_counter')}`)

// ============================================================================
// SECTION 3: ORCHESTRATION COMPONENTS
// ============================================================================
// Smithers uses React-like JSX to define AI workflows.
// Components: Ralph (iterator), Phase (stages), Step (tasks), Claude (AI)

console.log('\n' + '='.repeat(60))
console.log('Section 3: Orchestration Components')
console.log('='.repeat(60))
console.log(`
Component Hierarchy:
  SmithersProvider     <- Context: db, executionId, config
    Ralph              <- Iteration controller (1+ passes)
      Phase            <- Sequential stage (Research, Build, Test)
        Step           <- Ordered task within phase
          Claude       <- AI agent execution
        Parallel       <- Concurrent execution wrapper
          Step + Step  <- Run simultaneously
`)

// ============================================================================
// SECTION 4: STRUCTURED OUTPUT (SCHEMAS)
// ============================================================================
// Claude can return validated, typed data using Zod schemas.

console.log('\n' + '='.repeat(60))
console.log('Section 4: Structured Output (Schemas)')
console.log('='.repeat(60))

const AnalysisSchema = z.object({
  summary: z.string().describe('Brief summary of the analysis'),
  keyPoints: z.array(z.string()).describe('Key points identified'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
})

console.log('\nSchema definition (Zod):')
console.log(`  const AnalysisSchema = z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })`)

console.log('\nUsage in Claude component:')
console.log(`  <Claude model="haiku" schema={AnalysisSchema}>
    Analyze this code...
  </Claude>`)

// ============================================================================
// SECTION 5: LIVE ORCHESTRATION
// ============================================================================
// Now let's run a real orchestration with phases and steps!

console.log('\n' + '='.repeat(60))
console.log('Section 5: Live Orchestration')
console.log('='.repeat(60))
console.log('\nRunning a 2-phase orchestration with Claude agents...\n')

// Define a simple orchestration
async function DemoOrchestration() {
  return (
    <SmithersProvider
      db={db}
      executionId={executionId}
      maxIterations={1}
      globalTimeout={120000}
      onComplete={() => {
        console.log('\n[SmithersProvider] Orchestration complete!')
      }}
      onError={(err) => {
        console.error('\n[SmithersProvider] Error:', err.message)
      }}
    >
      <Ralph>
        {/* ============================================================ */}
        {/* PHASE 1: ANALYSIS                                            */}
        {/* Phases run sequentially. Next starts when previous completes */}
        {/* ============================================================ */}
        <Phase
          name="Analysis"
          onStart={() => console.log('\n[Phase] Starting: Analysis')}
          onComplete={() => console.log('[Phase] Completed: Analysis')}
        >
          <Step
            name="analyze-topic"
            onStart={() => console.log('  [Step] Starting: analyze-topic')}
            onComplete={() => console.log('  [Step] Completed: analyze-topic')}
          >
            <Claude
              model="haiku"
              maxTokens={500}
              stopConditions={[
                { type: 'turn_limit', value: 1 },
              ]}
              onFinished={(result) => {
                console.log('    [Claude] Analysis result:')
                console.log(`      Tokens: ${result.tokensUsed?.input ?? 0}in/${result.tokensUsed?.output ?? 0}out`)
                const preview = result.output.slice(0, 100).replace(/\n/g, ' ')
                console.log(`      Output: ${preview}...`)
                db.state.set('analysis_result', result.output)
              }}
            >
              In exactly 2 sentences, explain what makes React's declarative model powerful for building UIs.
            </Claude>
          </Step>
        </Phase>

        {/* ============================================================ */}
        {/* PHASE 2: PARALLEL EXECUTION                                  */}
        {/* Wrap Steps in Parallel to run them concurrently              */}
        {/* ============================================================ */}
        <Phase
          name="ParallelDemo"
          onStart={() => console.log('\n[Phase] Starting: ParallelDemo')}
          onComplete={() => console.log('[Phase] Completed: ParallelDemo')}
        >
          <Parallel>
            <Step
              name="task-a"
              onStart={() => console.log('  [Step] Starting: task-a (parallel)')}
              onComplete={() => console.log('  [Step] Completed: task-a')}
            >
              <Claude
                model="haiku"
                maxTokens={200}
                stopConditions={[{ type: 'turn_limit', value: 1 }]}
                onFinished={(result) => {
                  console.log('    [Claude] Task A done')
                  db.state.set('task_a_result', result.output.slice(0, 50))
                }}
              >
                In one sentence, what is TypeScript?
              </Claude>
            </Step>

            <Step
              name="task-b"
              onStart={() => console.log('  [Step] Starting: task-b (parallel)')}
              onComplete={() => console.log('  [Step] Completed: task-b')}
            >
              <Claude
                model="haiku"
                maxTokens={200}
                stopConditions={[{ type: 'turn_limit', value: 1 }]}
                onFinished={(result) => {
                  console.log('    [Claude] Task B done')
                  db.state.set('task_b_result', result.output.slice(0, 50))
                }}
              >
                In one sentence, what is Bun?
              </Claude>
            </Step>
          </Parallel>
        </Phase>
      </Ralph>
    </SmithersProvider>
  )
}

// ============================================================================
// EXECUTION
// ============================================================================

const root = createSmithersRoot()

try {
  await root.mount(DemoOrchestration)
  root.dispose()

  // Complete execution
  const finalState = db.state.getAll()
  await db.execution.complete(executionId, finalState)

  // ============================================================================
  // SECTION 6: RESULTS & STATE INSPECTION
  // ============================================================================

  console.log('\n' + '='.repeat(60))
  console.log('Section 6: Results & State Inspection')
  console.log('='.repeat(60))

  console.log('\nFinal state (db.state.getAll()):')
  const allState = db.state.getAll()
  for (const [key, value] of Object.entries(allState)) {
    const displayValue = typeof value === 'string' && value.length > 60
      ? value.slice(0, 60) + '...'
      : JSON.stringify(value)
    console.log(`  ${key}: ${displayValue}`)
  }

  // Query execution stats
  const execution = await db.execution.get(executionId)
  if (execution) {
    console.log('\nExecution stats:')
    console.log(`  Duration: ${execution.completed_at && execution.started_at
      ? new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()
      : 0}ms`)
    console.log(`  Agents: ${execution.total_agents}`)
    console.log(`  Tool calls: ${execution.total_tool_calls}`)
    console.log(`  Tokens: ${execution.total_tokens_used}`)
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('\n' + '='.repeat(60))
  console.log('Demo Complete!')
  console.log('='.repeat(60))
  console.log(`
What you learned:
  1. db.state     - SQLite-backed key-value persistence
  2. Phase        - Sequential workflow stages
  3. Step         - Ordered tasks within phases
  4. Claude       - AI agent execution
  5. Parallel     - Concurrent step execution
  6. Schemas      - Structured output with Zod

Next steps:
  - Run: bunx smithers-orchestrator init
  - Edit: .smithers/main.tsx
  - Run:  bunx smithers-orchestrator monitor

Docs: https://github.com/evmts/smithers
`)

} catch (error) {
  console.error('\nDemo failed:', error)
  root.dispose()
  await db.execution.fail(
    executionId,
    error instanceof Error ? error.message : String(error)
  )
  process.exit(1)
} finally {
  await db.close()
}
