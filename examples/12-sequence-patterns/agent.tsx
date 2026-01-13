/**
 * Sequence Patterns Example - Idiomatic Phase/Step Management
 *
 * Demonstrates the clean way to manage multi-phase agent execution
 * using SolidJS `Show` components and sequence helpers.
 *
 * Instead of:
 *   if (phase === 'research') return <Research />
 *   if (phase === 'write') return <Write />
 *   if (phase === 'review') return <Review />
 *
 * Use:
 *   <Show when={seq.is('research')}><Research /></Show>
 *   <Show when={seq.is('write')}><Write /></Show>
 *   <Show when={seq.is('review')}><Review /></Show>
 *
 * Run with: pnpm agent examples/12-sequence-patterns/agent.tsx
 */
import {
  Show,
  Claude,
  Phase,
  createSequence,
  createChecklist,
  createStep,
} from '@evmts/smithers'

// =============================================================================
// Pattern 1: Sequential Phases with createSequence
// =============================================================================

function SequentialAgent() {
  const seq = createSequence(['research', 'write', 'review'])

  return (
    <Show when={!seq.done()} fallback={<>All phases complete!</>}>
      <Phase name={seq.current()!}>
        <Show when={seq.is('research')}>
          <Claude onFinished={seq.next}>
            Research the topic of reactive programming patterns.
            Find 3 key concepts to explain.
          </Claude>
        </Show>

        <Show when={seq.is('write')}>
          <Claude onFinished={seq.next}>
            Write a brief article about the concepts you researched.
            Keep it under 500 words.
          </Claude>
        </Show>

        <Show when={seq.is('review')}>
          <Claude onFinished={seq.next}>
            Review what you wrote. Check for clarity and accuracy.
            Make any final improvements.
          </Claude>
        </Show>
      </Phase>
    </Show>
  )
}

// =============================================================================
// Pattern 2: Parallel Steps with createChecklist
// =============================================================================

function ParallelAgent() {
  const steps = createChecklist(['fetch-data', 'validate', 'transform'])

  return (
    <Show when={!steps.allDone()} fallback={<>All steps complete!</>}>
      {/* These can run in any order or in parallel */}
      <Show when={!steps.isDone('fetch-data')}>
        <Claude onFinished={() => steps.markDone('fetch-data')}>
          Fetch user data from the API
        </Claude>
      </Show>

      <Show when={!steps.isDone('validate')}>
        <Claude onFinished={() => steps.markDone('validate')}>
          Validate the data schema
        </Claude>
      </Show>

      <Show when={!steps.isDone('transform')}>
        <Claude onFinished={() => steps.markDone('transform')}>
          Transform data to the output format
        </Claude>
      </Show>
    </Show>
  )
}

// =============================================================================
// Pattern 3: Simple Single Step with createStep
// =============================================================================

function SingleStepAgent() {
  const research = createStep()
  const writing = createStep()

  return (
    <>
      <Show when={!research.done()}>
        <Claude onFinished={research.complete}>
          Research the topic
        </Claude>
      </Show>

      {/* Only show writing phase after research is done */}
      <Show when={research.done() && !writing.done()}>
        <Claude onFinished={writing.complete}>
          Write about what you learned
        </Claude>
      </Show>

      <Show when={research.done() && writing.done()}>
        Done with both phases!
      </Show>
    </>
  )
}

// =============================================================================
// Pattern 4: Nested Sequences (Complex Workflows)
// =============================================================================

function NestedSequenceAgent() {
  // Main phases
  const mainSeq = createSequence(['planning', 'implementation', 'testing'])

  // Sub-phases for implementation
  const implSteps = createChecklist(['api', 'ui', 'docs'])

  return (
    <Show when={!mainSeq.done()}>
      <Phase name={mainSeq.current()!}>
        {/* Planning phase */}
        <Show when={mainSeq.is('planning')}>
          <Claude onFinished={mainSeq.next}>
            Create a plan for the feature
          </Claude>
        </Show>

        {/* Implementation phase with sub-steps */}
        <Show when={mainSeq.is('implementation')}>
          <Show when={!implSteps.allDone()} fallback={<>{mainSeq.next()}</>}>
            <Show when={!implSteps.isDone('api')}>
              <Claude onFinished={() => implSteps.markDone('api')}>
                Implement the API layer
              </Claude>
            </Show>

            <Show when={!implSteps.isDone('ui')}>
              <Claude onFinished={() => implSteps.markDone('ui')}>
                Implement the UI components
              </Claude>
            </Show>

            <Show when={!implSteps.isDone('docs')}>
              <Claude onFinished={() => implSteps.markDone('docs')}>
                Write documentation
              </Claude>
            </Show>
          </Show>
        </Show>

        {/* Testing phase */}
        <Show when={mainSeq.is('testing')}>
          <Claude onFinished={mainSeq.next}>
            Run all tests and verify the feature works
          </Claude>
        </Show>
      </Phase>
    </Show>
  )
}

// Export patterns for use in other agents
export { SequentialAgent, ParallelAgent, SingleStepAgent, NestedSequenceAgent }

// Default export for CLI: pnpm agent examples/12-sequence-patterns/agent.tsx
export default <SequentialAgent />
