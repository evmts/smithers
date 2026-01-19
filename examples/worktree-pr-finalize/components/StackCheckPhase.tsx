/**
 * StackCheckPhase - Check if PR is stacked on another PR
 * 
 * Uses gh cli to determine if this PR's base branch is another PR
 * rather than main. If stacked on unmerged PR, workflow should wait.
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { If } from '../../../src/components/If.js'
import type { StackedPRInfo, PRInfo } from '../types.js'

export interface StackCheckPhaseProps {
  worktreePath: string
  pr: PRInfo | null
  stacked: StackedPRInfo | null
  onStackedCheck?: (stacked: StackedPRInfo) => void
}

export function StackCheckPhase({
  worktreePath,
  pr,
  stacked,
  onStackedCheck,
}: StackCheckPhaseProps): ReactNode {
  if (!pr) {
    return (
      <phase-content>
        <status type="error">No PR found for this worktree</status>
      </phase-content>
    )
  }

  const isBlockedByStack = stacked?.isStacked && stacked.basePR && !stacked.basePR.merged

  return (
    <phase-content name="stack-check">
      <context>
        <pr number={pr.number} base={pr.baseRefName} head={pr.headRefName} />
      </context>

      <If condition={!stacked}>
        <Step name="check-stack-dependency">
          {/* 
            Agent will execute:
            gh pr view --json baseRefName,headRefName
            Then check if baseRefName is another PR branch vs main
          */}
          <task type="shell">
            Check if PR #{pr.number} is stacked:
            1. Get base branch: {pr.baseRefName}
            2. If base != main/master, find PR for that branch
            3. Check if base PR is merged
            4. Report: isStacked, basePR info
          </task>
        </Step>
      </If>

      <If condition={stacked !== null}>
        <stack-status>
          <is-stacked>{stacked?.isStacked ? 'yes' : 'no'}</is-stacked>
          <If condition={stacked?.isStacked && stacked.basePR}>
            <base-pr
              number={stacked?.basePR?.number}
              branch={stacked?.basePR?.branch}
              merged={stacked?.basePR?.merged}
            />
          </If>
        </stack-status>
      </If>

      <If condition={isBlockedByStack}>
        <blocked>
          Waiting for base PR #{stacked?.basePR?.number} ({stacked?.basePR?.branch}) to merge first
        </blocked>
      </If>

      <If condition={stacked && !isBlockedByStack}>
        <ready>Stack check passed - ready to proceed</ready>
      </If>
    </phase-content>
  )
}
