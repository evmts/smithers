/**
 * WorktreeStatusPhase - Phase 1: Gather status of all worktrees
 */

import type { ReactNode } from 'react'
import { Step } from '../../../src/components/Step.js'
import { Claude } from '../../../src/components/Claude.js'
import type { WorktreeInfo } from '../types.js'

export interface WorktreeStatusPhaseProps {
  worktrees: WorktreeInfo[]
  onStatusComplete?: (candidates: WorktreeInfo[]) => void
}

export function WorktreeStatusPhase({ worktrees, onStatusComplete }: WorktreeStatusPhaseProps): ReactNode {
  const candidates = worktrees.filter((w) => w.mergeCandidate)
  const notReady = worktrees.filter((w) => !w.mergeCandidate)

  return (
    <phase-content>
      <summary>
        Found {worktrees.length} worktrees: {candidates.length} ready to merge, {notReady.length} need work
      </summary>

      <merge-candidates count={candidates.length}>
        {candidates.map((wt) => (
          <candidate
            key={wt.name}
            name={wt.name}
            pr={wt.prNumber}
            build={wt.buildPasses ? 'pass' : 'fail'}
            tests={wt.testsPassing ? 'pass' : 'fail'}
          />
        ))}
      </merge-candidates>

      <not-ready count={notReady.length}>
        {notReady.map((wt) => (
          <worktree
            key={wt.name}
            name={wt.name}
            has-pr={wt.hasPR}
            build={wt.buildPasses ? 'pass' : 'fail'}
            tests={wt.testsPassing ? 'pass' : 'fail'}
            reason={
              !wt.hasPR
                ? 'no-pr'
                : !wt.buildPasses
                  ? 'build-failing'
                  : !wt.testsPassing
                    ? 'tests-failing'
                    : 'unknown'
            }
          />
        ))}
      </not-ready>

      {candidates.length === 0 && (
        <Step name="analyze-blockers">
          <Claude model="sonnet">
            No worktrees are ready to merge. Analyze the following blockers and suggest fixes:

            {notReady.map((wt) => `- ${wt.name}: ${!wt.hasPR ? 'No PR' : !wt.buildPasses ? 'Build failing' : 'Tests failing'}`).join('\n')}

            For each, provide a brief recommendation on how to unblock.
          </Claude>
        </Step>
      )}
    </phase-content>
  )
}
