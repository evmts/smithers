/**
 * MergePhase - Phase 4: Cherry-pick and merge to main
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { If } from '../../../src/components/If.js'
import { Claude } from '../../../src/components/Claude.js'
import type { MergeCandidate, MergeResult } from '../types.js'

export interface MergePhaseProps {
  candidates: MergeCandidate[]
  targetBranch: string
  results: MergeResult[]
  current: string | null
  closePRs?: boolean
}

export function MergePhase({
  candidates,
  targetBranch,
  results,
  current,
  closePRs = true,
}: MergePhaseProps): ReactNode {
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  if (candidates.length === 0) {
    return (
      <phase-content>
        <status>No candidates to merge - workflow complete</status>
      </phase-content>
    )
  }

  return (
    <phase-content>
      <summary>
        Merging {candidates.length} PRs to {targetBranch}
      </summary>

      <merge-progress>
        {current && <current-operation>Merging: {current}</current-operation>}

        <merged count={successful.length}>
          {successful.map((r) => (
            <pr
              key={r.name}
              name={r.name}
              commit={r.commitSha}
              status={closePRs ? 'closed' : 'open'}
            />
          ))}
        </merged>

        <If condition={failed.length > 0}>
          <failed count={failed.length}>
            {failed.map((r) => (
              <pr key={r.name} name={r.name} error={r.error} />
            ))}
          </failed>
        </If>
      </merge-progress>

      <If condition={failed.length > 0}>
        <Step name="handle-merge-failures">
          <Claude model="sonnet">
            Some PRs failed to merge:

            {failed.map((r) => `- ${r.name}: ${r.error}`).join('\n')}

            For each failure:
            1. Analyze the error
            2. Attempt manual resolution if possible
            3. If unresolvable, explain what human intervention is needed

            Successfully merged so far: {successful.map((r) => r.name).join(', ')}
          </Claude>
        </Step>
      </If>

      <If condition={failed.length === 0 && results.length === candidates.length}>
        <Step name="post-merge-verification">
          <Claude model="sonnet">
            All {successful.length} PRs merged successfully to {targetBranch}:

            {successful.map((r) => `- ${r.name} (${r.commitSha})`).join('\n')}

            Run final verification:
            1. Run full test suite: bun test
            2. Run build check: bun run check
            3. Verify all expected changes are present
            4. Report any issues found
          </Claude>
        </Step>
      </If>
    </phase-content>
  )
}
