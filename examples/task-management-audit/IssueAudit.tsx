/**
 * IssueAudit - Phase 2: Audit issues for implementation status
 */

import type { ReactNode } from 'react'
import { Parallel } from '../../src/components/Parallel.js'
import { Step } from '../../src/components/Step.js'
import { Subagent } from '../../src/components/Subagent.js'
import { Worktree } from '../../src/components/Worktree.js'
import { If } from '../../src/components/If.js'
import { Claude } from '../../src/components/Claude.js'
import { Commit } from '../../src/components/Git/Commit.js'
import type { IssueInfo } from './types.js'

export interface IssueAuditProps {
  issues: IssueInfo[]
}

export function IssueAudit({ issues }: IssueAuditProps): ReactNode {
  const implemented = issues.filter(i => i.implemented)
  const needsWorktree = issues.filter(i => !i.implemented && !i.hasWorktree)
  const inProgress = issues.filter(i => !i.implemented && i.hasWorktree)

  return (
    <phase-content>
      <summary>
        {issues.length} issues: {implemented.length} implemented, {inProgress.length} in-progress, {needsWorktree.length} need worktrees
      </summary>

      <If condition={implemented.length > 0}>
        <Step name="Delete implemented issues">
          <Claude>
            {`Delete implemented issue files:
              ${implemented.map(i => `rm issues/${i.name}.md`).join('\n')}`}
          </Claude>
        </Step>
      </If>

      <If condition={needsWorktree.length > 0}>
        <Parallel>
          {needsWorktree.map(issue => (
            <IssueWorktreeAgent key={issue.name} issue={issue} />
          ))}
        </Parallel>
      </If>
    </phase-content>
  )
}

interface IssueWorktreeAgentProps {
  issue: IssueInfo
}

/**
 * Spawns a subagent to implement an issue in its own worktree
 */
function IssueWorktreeAgent({ issue }: IssueWorktreeAgentProps): ReactNode {
  return (
    <Subagent name={`implement-${issue.name}`} parallel>
      <Worktree branch={`issue/${issue.name}`} base="main" cleanup={false}>
        <Step name={`Implement ${issue.name}`}>
          <Claude>
            {`Read issues/${issue.name}.md and implement the described feature.
              Make commits as you progress.
              When complete, push and create PR:
              git push -u origin issue/${issue.name}
              gh pr create --title "Implement ${issue.name}" --body "Closes ${issue.name}"`}
          </Claude>
        </Step>
        <Commit autoGenerate notes={{ issue: issue.name }} />
      </Worktree>
    </Subagent>
  )
}
