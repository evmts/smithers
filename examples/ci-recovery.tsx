#!/usr/bin/env bun
/**
 * CI Recovery Workflow
 *
 * This example demonstrates automatic CI failure recovery:
 * 1. Polls GitHub Actions for CI status
 * 2. When a failure is detected, Claude analyzes logs
 * 3. Claude makes fixes and commits them
 * 4. Process repeats until CI passes
 *
 * Run with: bun examples/ci-recovery.tsx
 */

import { createSmithersRoot } from '../src'
import { createSmithersDB } from '../smithers-orchestrator/src/db'
import { Ralph } from '../src/components/Ralph'
import { SmithersProvider } from '../smithers-orchestrator/src/components/SmithersProvider'
import { Orchestration } from '../smithers-orchestrator/src/components/Orchestration'
import { Claude } from '../smithers-orchestrator/src/components/Claude'
import { Phase } from '../smithers-orchestrator/src/components/Phase'
import { Step } from '../smithers-orchestrator/src/components/Step'
import { Commit, Snapshot } from '../src/components/JJ'
import { OnCIFailure } from '../src/components/Hooks'

// Initialize database
const db = await createSmithersDB({ path: '.smithers/ci-recovery' })
const executionId = await db.execution.start('CI Recovery', 'examples/ci-recovery.tsx')

// State helpers
async function getPhase(): Promise<string> {
  return (await db.state.get<string>('phase')) ?? 'monitoring'
}

async function setPhase(phase: string, trigger: string): Promise<void> {
  await db.state.set('phase', phase, trigger)
}

async function getFixAttempts(): Promise<number> {
  return (await db.state.get<number>('fix_attempts')) ?? 0
}

async function incrementFixAttempts(): Promise<void> {
  const current = await getFixAttempts()
  await db.state.set('fix_attempts', current + 1, 'fix_attempt')
}

// CI Recovery Workflow
async function CIRecoveryWorkflow() {
  const phase = await getPhase()
  const fixAttempts = await getFixAttempts()

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Orchestration
        globalTimeout={7200000} // 2 hours
        snapshotBeforeStart
        stopConditions={[
          { type: 'pattern', value: /MANUAL_INTERVENTION_REQUIRED/i, message: 'Manual intervention needed' }
        ]}
      >
        <Ralph maxIterations={20}>
          {/* MONITORING PHASE - Wait for CI failure */}
          {phase === 'monitoring' && (
            <Phase name="Monitoring CI">
              <div>Monitoring GitHub Actions for failures...</div>

              {/* This hook triggers when CI fails */}
              <OnCIFailure
                provider="github-actions"
                pollInterval={30000} // Check every 30 seconds
              >
                {/* When CI fails, this block executes */}
                <Claude
                  model="haiku"
                  tools={['Bash']}
                  stopConditions={[{ type: 'turn_limit', value: 3 }]}
                  onFinished={async (result) => {
                    // Store the failure info
                    await db.state.set('ci_failure', result.output, 'ci_failure_detected')
                    await setPhase('analyzing', 'ci_failure_detected')
                  }}
                >
                  CI has failed. Run `gh run list --limit 1 --json conclusion,databaseId,name`
                  and `gh run view --log-failed` to get failure details.
                  Summarize what failed.
                </Claude>
              </OnCIFailure>
            </Phase>
          )}

          {/* ANALYZING PHASE - Understand the failure */}
          {phase === 'analyzing' && (
            <Phase name={`Analyzing Failure (attempt ${fixAttempts + 1})`}>
              <Snapshot description={`Before fix attempt ${fixAttempts + 1}`} />

              <Step name="analyze-failure">
                <Claude
                  model="sonnet"
                  reportingEnabled
                  tools={['Read', 'Bash', 'Glob', 'Grep']}
                  stopConditions={[
                    { type: 'turn_limit', value: 15 },
                    { type: 'token_limit', value: 30000 },
                  ]}
                  onFinished={async (result) => {
                    // Store analysis
                    await db.state.set('analysis', result.output, 'analysis_complete')
                    await setPhase('fixing', 'analysis_complete')
                  }}
                  onError={async () => {
                    await setPhase('escalate', 'analysis_failed')
                  }}
                >
                  Analyze the CI failure. The failure logs were:
                  {await db.state.get('ci_failure')}

                  1. Identify the root cause of the failure
                  2. Determine which files need to be modified
                  3. Use the Report tool to document your findings

                  Do NOT make any changes yet - just analyze.
                </Claude>
              </Step>
            </Phase>
          )}

          {/* FIXING PHASE - Apply the fix */}
          {phase === 'fixing' && (
            <Phase name="Applying Fix">
              <Step name="apply-fix" snapshotBefore commitAfter>
                <Claude
                  model="sonnet"
                  reportingEnabled
                  tools={['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep']}
                  stopConditions={[
                    { type: 'turn_limit', value: 25 },
                    { type: 'token_limit', value: 50000 },
                  ]}
                  onFinished={async () => {
                    await incrementFixAttempts()
                    await setPhase('verifying', 'fix_applied')
                  }}
                  onError={async () => {
                    const attempts = await getFixAttempts()
                    if (attempts >= 3) {
                      await setPhase('escalate', 'too_many_fix_attempts')
                    } else {
                      await setPhase('analyzing', 'fix_failed')
                    }
                  }}
                >
                  Based on your analysis:
                  {await db.state.get('analysis')}

                  Apply the fix:
                  1. Make the necessary code changes
                  2. Run any relevant tests locally to verify
                  3. Use the Report tool to document what you changed and why

                  Be minimal and surgical - only change what's necessary to fix the CI failure.
                </Claude>
              </Step>

              <Commit autoDescribe notes="ci-fix" />
            </Phase>
          )}

          {/* VERIFYING PHASE - Run local tests before pushing */}
          {phase === 'verifying' && (
            <Phase name="Verifying Fix">
              <Step name="local-verification">
                <Claude
                  model="haiku"
                  tools={['Bash']}
                  stopConditions={[{ type: 'turn_limit', value: 10 }]}
                  onFinished={async (result) => {
                    if (result.output.includes('PASS') || result.output.includes('success')) {
                      await setPhase('pushing', 'local_tests_passed')
                    } else {
                      const attempts = await getFixAttempts()
                      if (attempts >= 3) {
                        await setPhase('escalate', 'too_many_attempts')
                      } else {
                        await setPhase('analyzing', 'local_tests_failed')
                      }
                    }
                  }}
                >
                  Run the test suite locally to verify the fix: `bun test`
                  Report whether tests pass or fail.
                </Claude>
              </Step>
            </Phase>
          )}

          {/* PUSHING PHASE - Push and monitor CI */}
          {phase === 'pushing' && (
            <Phase name="Pushing to Remote">
              <Step name="push-changes">
                <Claude
                  model="haiku"
                  tools={['Bash']}
                  stopConditions={[{ type: 'turn_limit', value: 5 }]}
                  onFinished={async () => {
                    await setPhase('monitoring', 'pushed_to_remote')
                  }}
                >
                  Push the changes to the remote:
                  1. Run `jj git push` or `git push`
                  2. Report success or failure
                </Claude>
              </Step>
            </Phase>
          )}

          {/* ESCALATE - Too many failures, need human help */}
          {phase === 'escalate' && (
            <Phase name="Escalation Required">
              <Claude
                model="sonnet"
                reportingEnabled
                tools={['Bash']}
                stopConditions={[{ type: 'turn_limit', value: 5 }]}
              >
                CI recovery has failed after multiple attempts.

                Create a summary of:
                1. What the original failure was
                2. What fixes were attempted
                3. Why they didn't work
                4. Recommendations for manual intervention

                Use: `gh issue create --title "CI Recovery Failed" --body "..."`
                to create an issue for the team.

                End with: MANUAL_INTERVENTION_REQUIRED
              </Claude>
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

  console.log('Starting CI Recovery Workflow')
  console.log('============================')
  console.log('')
  console.log('This workflow monitors GitHub Actions and automatically')
  console.log('attempts to fix CI failures.')
  console.log('')
  console.log('Press Ctrl+C to stop monitoring.')
  console.log('')

  try {
    await root.mount(CIRecoveryWorkflow)

    const finalState = await db.state.getAll()
    await db.execution.complete(executionId, finalState)

    console.log('')
    console.log('CI Recovery workflow finished.')

    // Show recovery statistics
    const fixAttempts = await getFixAttempts()
    const commits = await db.getVCSManager(executionId).getCommits()
    const reports = await db.getVCSManager(executionId).getReports()

    console.log(`Fix attempts: ${fixAttempts}`)
    console.log(`Commits made: ${commits.length}`)
    console.log(`Reports logged: ${reports.length}`)

  } catch (error) {
    console.error('Workflow error:', error)
    await db.execution.fail(executionId, error instanceof Error ? error.message : String(error))
  } finally {
    await db.close()
  }
}

main().catch(console.error)
