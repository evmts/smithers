#!/usr/bin/env bun
/**
 * Review-Driven Development Workflow
 *
 * This example demonstrates a workflow where:
 * 1. Claude implements a feature
 * 2. A code review is performed
 * 3. If review fails, go back and fix issues
 * 4. If review passes, run tests and commit
 *
 * Run with: bun examples/review-workflow.tsx
 */

import { createSmithersRoot } from '../src'
import { createSmithersDB } from '../smithers-orchestrator/src/db'
import { Ralph } from '../src/components/Ralph'
import { SmithersProvider } from '../smithers-orchestrator/src/components/SmithersProvider'
import { Orchestration } from '../smithers-orchestrator/src/components/Orchestration'
import { Claude } from '../smithers-orchestrator/src/components/Claude'
import { Phase } from '../smithers-orchestrator/src/components/Phase'
import { Step } from '../smithers-orchestrator/src/components/Step'
import { Commit, Snapshot, Status } from '../src/components/JJ'
import { Review } from '../src/components/Review'

// Initialize database
const db = await createSmithersDB({ path: '.smithers/review-workflow' })
const executionId = await db.execution.start('Review Workflow', 'examples/review-workflow.tsx')

// State helpers
async function getPhase(): Promise<string> {
  return (await db.state.get<string>('phase')) ?? 'implement'
}

async function setPhase(phase: string, trigger: string): Promise<void> {
  await db.state.set('phase', phase, trigger)
}

async function getIterationCount(): Promise<number> {
  return (await db.state.get<number>('iteration')) ?? 0
}

async function incrementIteration(): Promise<void> {
  const current = await getIterationCount()
  await db.state.set('iteration', current + 1, 'iteration_increment')
}

// Main workflow
async function ReviewWorkflow() {
  const phase = await getPhase()
  const iteration = await getIterationCount()

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Orchestration
        globalTimeout={3600000} // 1 hour
        snapshotBeforeStart
        stopConditions={[
          { type: 'pattern', value: /CRITICAL_ERROR/i, message: 'Critical error detected' }
        ]}
      >
        <Ralph maxIterations={10}>
          {/* IMPLEMENTATION PHASE */}
          {phase === 'implement' && (
            <Phase name={`Implementation (iteration ${iteration + 1})`}>
              <Snapshot description={`Before implementation iteration ${iteration + 1}`} />

              <Step name="implement" snapshotBefore commitAfter>
                <Claude
                  model="sonnet"
                  reportingEnabled
                  tools={['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep']}
                  stopConditions={[
                    { type: 'turn_limit', value: 30 },
                    { type: 'token_limit', value: 50000 },
                  ]}
                  onFinished={async () => {
                    await incrementIteration()
                    await setPhase('review', 'implementation_complete')
                  }}
                  onError={async (error) => {
                    console.error('Implementation error:', error)
                    await setPhase('error', 'implementation_failed')
                  }}
                >
                  {iteration === 0 ? (
                    `Implement a simple utility function that validates email addresses.
                    Create a file at src/utils/email.ts with:
                    1. A function validateEmail(email: string): boolean
                    2. A function extractDomain(email: string): string | null
                    3. Add comprehensive tests in src/utils/email.test.ts`
                  ) : (
                    `Fix the issues found in the code review.
                    Review the git notes on the previous commit to see the feedback.
                    Make the necessary corrections and improvements.`
                  )}
                </Claude>
              </Step>

              <Commit autoDescribe notes={`iteration-${iteration + 1}`} />
            </Phase>
          )}

          {/* REVIEW PHASE */}
          {phase === 'review' && (
            <Phase name="Code Review">
              <Review
                target={{ type: 'diff', ref: 'main' }}
                agent="claude"
                model="sonnet"
                blocking
                criteria={[
                  'Function names are descriptive and follow conventions',
                  'Edge cases are handled (null, undefined, empty strings)',
                  'Tests cover happy path and error cases',
                  'No console.log statements left in production code',
                  'TypeScript types are properly defined',
                ]}
                postToGitNotes
                onFinished={async (review) => {
                  if (review.approved) {
                    console.log('Review APPROVED!')
                    await setPhase('test', 'review_approved')
                  } else {
                    console.log(`Review REJECTED: ${review.issues.length} issues found`)
                    review.issues.forEach((issue, i) => {
                      console.log(`  ${i + 1}. [${issue.severity}] ${issue.message}`)
                    })
                    await setPhase('implement', 'review_rejected')
                  }
                }}
              />
            </Phase>
          )}

          {/* TESTING PHASE */}
          {phase === 'test' && (
            <Phase name="Testing">
              <Step name="run-tests">
                <Claude
                  model="haiku"
                  tools={['Bash']}
                  stopConditions={[{ type: 'turn_limit', value: 5 }]}
                  onFinished={async (result) => {
                    if (result.output.includes('PASS') || result.output.includes('passed')) {
                      await setPhase('complete', 'tests_passed')
                    } else {
                      await setPhase('implement', 'tests_failed')
                    }
                  }}
                >
                  Run the tests with `bun test src/utils/email.test.ts`. Report success or failure.
                </Claude>
              </Step>
            </Phase>
          )}

          {/* COMPLETE */}
          {phase === 'complete' && (
            <Phase name="Complete">
              <Commit message={`Feature complete after ${iteration} iteration(s)`} />
              <div>Workflow complete! Feature implemented and reviewed.</div>
            </Phase>
          )}

          {/* ERROR */}
          {phase === 'error' && (
            <Phase name="Error">
              <div>An error occurred. Check the logs.</div>
            </Phase>
          )}
        </Ralph>
      </Orchestration>
    </SmithersProvider>
  )
}

// Run the workflow
async function main() {
  const root = createSmithersRoot()

  console.log('Starting Review-Driven Development Workflow')
  console.log('==========================================')
  console.log('')

  try {
    await root.mount(ReviewWorkflow)

    const finalState = await db.state.getAll()
    await db.execution.complete(executionId, finalState)

    console.log('')
    console.log('Workflow complete!')

    // Show review history
    const reviews = await db.getVCSManager(executionId).getReviews()
    console.log(`Total reviews: ${reviews.length}`)
    console.log(`Approved: ${reviews.filter(r => r.approved).length}`)
    console.log(`Rejected: ${reviews.filter(r => !r.approved).length}`)

  } catch (error) {
    console.error('Workflow failed:', error)
    await db.execution.fail(executionId, error instanceof Error ? error.message : String(error))
  } finally {
    await db.close()
  }
}

main().catch(console.error)
