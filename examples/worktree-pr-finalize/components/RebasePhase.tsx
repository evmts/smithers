/**
 * RebasePhase - Rebase branch on origin/main
 * 
 * Fetches latest main and rebases the worktree branch.
 * Handles conflicts by invoking Claude for resolution.
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { If } from '../../../src/components/If.js'
import { Claude } from '../../../src/components/Claude.js'
import type { RebaseResult, WorktreeContext } from '../types.js'

export interface RebasePhaseProps {
  worktree: WorktreeContext
  result: RebaseResult | null
  onRebaseComplete?: (result: RebaseResult) => void
}

export function RebasePhase({
  worktree,
  result,
  onRebaseComplete,
}: RebasePhaseProps): ReactNode {
  const hasConflicts = result && !result.success && result.conflictFiles?.length

  return (
    <phase-content name="rebase">
      <context>
        <worktree name={worktree.name} path={worktree.path} branch={worktree.branch} />
      </context>

      <If condition={!result}>
        <Step name="fetch-and-rebase">
          <Claude model="sonnet">
            Rebase {worktree.branch} on origin/main:

            ```bash
            cd {worktree.path}
            git fetch origin main
            git rebase origin/main
            ```

            If rebase succeeds, report:
            - beforeSha: HEAD before rebase
            - afterSha: HEAD after rebase
            - success: true

            If conflicts occur:
            - List conflicting files
            - Attempt to resolve each conflict
            - If unresolvable, abort and report conflict files
          </Claude>
        </Step>
      </If>

      <If condition={result?.success}>
        <success>
          Rebased {worktree.branch}: {result?.beforeSha?.slice(0, 7)} → {result?.afterSha?.slice(0, 7)}
        </success>
      </If>

      <If condition={hasConflicts}>
        <conflicts>
          <files>{result?.conflictFiles?.join(', ')}</files>
          <Step name="resolve-conflicts">
            <Claude model="sonnet">
              Resolve rebase conflicts in {worktree.path}:

              Conflicting files:
              {result?.conflictFiles?.map((f) => `- ${f}`).join('\n')}

              For each file:
              1. Read the conflict markers
              2. Understand both versions
              3. Choose the correct resolution (prefer incoming if feature, ours if config)
              4. Stage the resolved file
              5. Continue rebase

              If a conflict cannot be auto-resolved, describe what manual intervention is needed.
            </Claude>
          </Step>
        </conflicts>
      </If>

      <If condition={result && !result.success && !hasConflicts}>
        <error>{result?.error}</error>
      </If>
    </phase-content>
  )
}
