/**
 * WorktreeAudit - Phase 1: Audit worktrees for merged branches
 */

import type { ReactNode } from 'react'
import { Parallel } from '../../src/components/Parallel.js'
import { Step } from '../../src/components/Step.js'
import { If } from '../../src/components/If.js'
import { Claude } from '../../src/components/Claude.js'
import type { WorktreeInfo } from './types.js'

export interface WorktreeAuditProps {
  worktrees: WorktreeInfo[]
}

export function WorktreeAudit({ worktrees }: WorktreeAuditProps): ReactNode {
  const mergedWorktrees = worktrees.filter(w => w.merged)
  const activeWorktrees = worktrees.filter(w => !w.merged)

  return (
    <phase-content>
      <summary>
        Found {worktrees.length} worktrees: {mergedWorktrees.length} merged, {activeWorktrees.length} active
      </summary>

      <If condition={mergedWorktrees.length > 0}>
        <Parallel>
          {mergedWorktrees.map(wt => (
            <Step key={wt.name} name={`Delete ${wt.name}`}>
              <Claude>
                {`Delete merged worktree and branch:
                  git worktree remove .worktrees/${wt.name} --force
                  git branch -d issue/${wt.name}`}
              </Claude>
            </Step>
          ))}
        </Parallel>
      </If>

      <If condition={mergedWorktrees.length === 0}>
        <status>No merged worktrees to clean up</status>
      </If>
    </phase-content>
  )
}
