/**
 * StackedRebasePhase - Phase 3: Rebase branches into linear stacked history
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { If } from '../../../src/components/If.js'
import { Claude } from '../../../src/components/Claude.js'
import type { MergeCandidate, MergeResult } from '../types.js'

export interface StackedRebasePhaseProps {
  candidates: MergeCandidate[]
  targetBranch: string
  results: MergeResult[]
  current: string | null
  onRebaseComplete?: (results: MergeResult[]) => void
}

export function StackedRebasePhase({
  candidates,
  targetBranch,
  results,
  current,
  onRebaseComplete,
}: StackedRebasePhaseProps): ReactNode {
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  if (candidates.length === 0) {
    return (
      <phase-content>
        <status>No candidates to rebase - skipping</status>
      </phase-content>
    )
  }

  return (
    <phase-content>
      <summary>
        Rebasing {candidates.length} branches onto {targetBranch}
      </summary>

      <rebase-progress>
        {current && <current-operation>Rebasing: {current}</current-operation>}

        <completed count={successful.length}>
          {successful.map((r) => (
            <rebased key={r.name} name={r.name} commit={r.commitSha} />
          ))}
        </completed>

        <If condition={failed.length > 0}>
          <failed count={failed.length}>
            {failed.map((r) => (
              <conflict key={r.name} name={r.name} error={r.error} />
            ))}
          </failed>
        </If>
      </rebase-progress>

      <If condition={failed.length > 0}>
        <Step name="resolve-conflicts">
          <Claude model="sonnet">
            Rebase conflicts occurred in the following branches:

            {failed.map((r) => `- ${r.name}: ${r.error}`).join('\n')}

            For each conflict:
            1. Checkout the branch
            2. Attempt rebase with conflict resolution
            3. If automated resolution fails, describe the manual steps needed

            Start with the first conflicting branch.
          </Claude>
        </Step>
      </If>

      <If condition={failed.length === 0 && results.length === candidates.length}>
        <status>All branches rebased successfully into linear history</status>
      </If>
    </phase-content>
  )
}
