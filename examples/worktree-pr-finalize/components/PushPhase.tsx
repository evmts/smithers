/**
 * PushPhase - Final rebase and force push
 * 
 * Does one more rebase on origin/main to ensure linear history,
 * then force pushes the branch.
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { If } from '../../../src/components/If.js'
import { Claude } from '../../../src/components/Claude.js'
import type { PushResult, WorktreeContext } from '../types.js'

export interface PushPhaseProps {
  worktree: WorktreeContext
  result: PushResult | null
  onPushComplete?: (result: PushResult) => void
}

export function PushPhase({
  worktree,
  result,
  onPushComplete,
}: PushPhaseProps): ReactNode {
  return (
    <phase-content name="push">
      <context>
        <worktree name={worktree.name} branch={worktree.branch} />
      </context>

      <If condition={!result}>
        <Step name="final-rebase-and-push">
          <Claude model="sonnet">
            Final rebase and force push for {worktree.branch}:

            ```bash
            cd {worktree.path}
            
            # Final rebase on latest main
            git fetch origin main
            git rebase origin/main
            
            # Force push (with lease for safety)
            git push --force-with-lease origin {worktree.branch}
            ```

            Report:
            - success: whether push succeeded
            - sha: the pushed commit SHA
            - error: any error message if failed

            If rebase conflicts occur at this stage, resolve them before pushing.
          </Claude>
        </Step>
      </If>

      <If condition={result?.success}>
        <success>
          Pushed {worktree.branch} at {result?.sha?.slice(0, 7)}
        </success>
      </If>

      <If condition={result && !result.success}>
        <error>{result?.error}</error>
      </If>
    </phase-content>
  )
}
