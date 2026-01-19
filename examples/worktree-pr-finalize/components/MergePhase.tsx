/**
 * MergePhase - Merge the PR
 * 
 * Uses gh cli to merge the PR once it's ready.
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { If } from '../../../src/components/If.js'
import { Claude } from '../../../src/components/Claude.js'
import type { MergeResult } from '../types.js'

export interface MergePhaseProps {
  prNumber: number
  result: MergeResult | null
  method?: 'merge' | 'squash' | 'rebase'
  deleteAfterMerge?: boolean
  onMergeComplete?: (result: MergeResult) => void
}

export function MergePhase({
  prNumber,
  result,
  method = 'squash',
  deleteAfterMerge = true,
  onMergeComplete,
}: MergePhaseProps): ReactNode {
  return (
    <phase-content name="merge">
      <context>
        <pr number={prNumber} />
        <config method={method} delete-branch={deleteAfterMerge} />
      </context>

      <If condition={!result}>
        <Step name="merge-pr">
          <Claude model="sonnet">
            Merge PR #{prNumber}:

            ```bash
            gh pr merge {prNumber} --{method} {deleteAfterMerge ? '--delete-branch' : ''}
            ```

            Report:
            - success: whether merge succeeded
            - method: {method}
            - sha: the merge commit SHA (from output)
            - error: any error if failed

            If merge fails due to branch protection or required reviews,
            report what's blocking and whether it can be resolved automatically.
          </Claude>
        </Step>
      </If>

      <If condition={result?.success}>
        <success>
          Merged PR #{prNumber} via {result?.method} at {result?.sha?.slice(0, 7)}
        </success>
      </If>

      <If condition={result && !result.success}>
        <error>{result?.error}</error>
      </If>
    </phase-content>
  )
}
