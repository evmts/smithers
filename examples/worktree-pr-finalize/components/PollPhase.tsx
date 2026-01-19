/**
 * PollPhase - Poll CI status until PR is ready to merge
 * 
 * Uses gh cli to poll PR status checks and mergeable state.
 * Implements exponential backoff polling.
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { If } from '../../../src/components/If.js'
import { Claude } from '../../../src/components/Claude.js'
import type { PRInfo, CheckStatus } from '../types.js'

export interface PollPhaseProps {
  prNumber: number
  pr: PRInfo | null
  onReady?: () => void
  maxAttempts?: number
  pollIntervalMs?: number
}

export function PollPhase({
  prNumber,
  pr,
  onReady,
  maxAttempts = 60,
  pollIntervalMs = 30000,
}: PollPhaseProps): ReactNode {
  const pendingChecks = pr?.statusCheckRollup?.filter((c) => c.status === 'PENDING') ?? []
  const failedChecks =
    pr?.statusCheckRollup?.filter((c) => c.conclusion === 'FAILURE') ?? []
  const allPassed =
    pr?.statusCheckRollup?.every(
      (c) => c.status === 'COMPLETED' && c.conclusion !== 'FAILURE'
    ) ?? false
  const isMergeable = pr?.mergeable && pr?.mergeStateStatus === 'CLEAN'

  return (
    <phase-content name="poll">
      <context>
        <pr number={prNumber} mergeable={pr?.mergeable} merge-state={pr?.mergeStateStatus} />
        <checks
          total={pr?.statusCheckRollup?.length ?? 0}
          pending={pendingChecks.length}
          failed={failedChecks.length}
        />
      </context>

      <If condition={!pr || !isMergeable}>
        <Step name="poll-pr-status">
          <Claude model="sonnet">
            Poll PR #{prNumber} until ready to merge:

            ```bash
            # Check PR status
            gh pr view {prNumber} --json mergeable,mergeStateStatus,statusCheckRollup
            ```

            Poll every {pollIntervalMs / 1000}s for up to {maxAttempts} attempts.

            Ready conditions:
            - mergeable: true
            - mergeStateStatus: CLEAN
            - All status checks passed or neutral

            If checks fail:
            1. Identify failing checks
            2. If fixable (lint/type errors), fix and push
            3. If infrastructure issue, wait and retry
            4. Report blocking issues

            Current status:
            - Pending checks: {pendingChecks.map((c) => c.name).join(', ') || 'none'}
            - Failed checks: {failedChecks.map((c) => c.name).join(', ') || 'none'}
          </Claude>
        </Step>
      </If>

      <If condition={failedChecks.length > 0}>
        <failed-checks>
          {failedChecks.map((c) => (
            <check key={c.name} name={c.name} conclusion={c.conclusion} />
          ))}
        </failed-checks>

        <Step name="fix-failing-checks">
          <Claude model="sonnet">
            Fix failing CI checks for PR #{prNumber}:

            Failing checks:
            {failedChecks.map((c) => `- ${c.name}`).join('\n')}

            For each failure:
            1. Get check details: `gh run view [run-id] --log-failed`
            2. Identify the error
            3. Fix the issue locally
            4. Push the fix
            5. Wait for checks to re-run
          </Claude>
        </Step>
      </If>

      <If condition={pendingChecks.length > 0}>
        <waiting>
          Waiting for: {pendingChecks.map((c) => c.name).join(', ')}
        </waiting>
      </If>

      <If condition={isMergeable && allPassed}>
        <ready>PR #{prNumber} is ready to merge</ready>
      </If>
    </phase-content>
  )
}
