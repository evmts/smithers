/**
 * WorktreePRFinalize - Single worktree PR finalization workflow
 *
 * Orchestrates the full workflow for getting a single worktree PR merged:
 * 1. Stack Check: Determine if stacked on another PR
 * 2. Rebase: Rebase on origin/main
 * 3. Review: Self-review + handle GH reviews
 * 4. Push: Final rebase and force push
 * 5. Poll: Wait for CI to pass
 * 6. Merge: Merge the PR
 *
 * State Management: SQLite-backed via db.state and useQueryValue
 */

import { useRef, type ReactNode } from 'react'
import { Phase } from '../../src/components/Phase.js'
import { PhaseRegistryProvider } from '../../src/components/PhaseRegistry.js'
import { useSmithers } from '../../src/components/SmithersProvider.js'
import { useMount } from '../../src/reconciler/hooks.js'
import { useQueryValue } from '../../src/reactive-sqlite/index.js'

import { StackCheckPhase } from './components/StackCheckPhase.js'
import { RebasePhase } from './components/RebasePhase.js'
import { ReviewPhase } from './components/ReviewPhase.js'
import { PushPhase } from './components/PushPhase.js'
import { PollPhase } from './components/PollPhase.js'
import { MergePhase } from './components/MergePhase.js'

import type {
  WorktreeContext,
  PRInfo,
  StackedPRInfo,
  RebaseResult,
  PushResult,
  MergeResult,
  WorktreeFinalizeState,
} from './types.js'

function stateKey(worktree: string, key: string): string {
  return `worktree-finalize:${worktree}:${key}`
}

export interface WorktreePRFinalizeProps {
  worktree: WorktreeContext
  mergeMethod?: 'merge' | 'squash' | 'rebase'
  deleteAfterMerge?: boolean
  onComplete?: (report: { success: boolean; mergedSha?: string; error?: string }) => void
}

export function WorktreePRFinalize({
  worktree,
  mergeMethod = 'squash',
  deleteAfterMerge = true,
  onComplete,
}: WorktreePRFinalizeProps): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const initRef = useRef(false)

  // SQLite-backed state
  const { data: prJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKey(worktree.name, 'pr')]
  )
  const pr: PRInfo | null = prJson ? JSON.parse(prJson) : null

  const { data: stackedJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKey(worktree.name, 'stacked')]
  )
  const stacked: StackedPRInfo | null = stackedJson ? JSON.parse(stackedJson) : null

  const { data: rebaseJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKey(worktree.name, 'rebase')]
  )
  const rebaseResult: RebaseResult | null = rebaseJson ? JSON.parse(rebaseJson) : null

  const { data: reviewsHandledStr } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKey(worktree.name, 'reviews-handled')]
  )
  const reviewsHandled = reviewsHandledStr === 'true'

  const { data: pushJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKey(worktree.name, 'push')]
  )
  const pushResult: PushResult | null = pushJson ? JSON.parse(pushJson) : null

  const { data: mergeJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKey(worktree.name, 'merge')]
  )
  const mergeResult: MergeResult | null = mergeJson ? JSON.parse(mergeJson) : null

  // Initialize: fetch PR info
  useMount(() => {
    if (initRef.current) return
    initRef.current = true
    ;(async () => {
      try {
        const result =
          await Bun.$`gh pr list --head ${worktree.branch} --json number,title,headRefName,baseRefName,state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,reviews`
            .cwd(worktree.path)
            .quiet()

        const prs = JSON.parse(result.stdout.toString())
        if (prs.length > 0) {
          db.state.set(stateKey(worktree.name, 'pr'), prs[0], 'init-pr')
        }
      } catch (err) {
        console.error(`[${worktree.name}] Failed to fetch PR:`, err)
      }
    })()
  })

  // Skip conditions
  const isBlockedByStack = stacked?.isStacked && stacked.basePR && !stacked.basePR.merged
  const noPR = !pr

  return (
    <worktree-finalize name={worktree.name} branch={worktree.branch}>
      <PhaseRegistryProvider>
        {/* Phase 1: Check if stacked on another PR */}
        <Phase
          name="StackCheck"
          skipIf={() => noPR}
          onComplete={() => {
            db.vcs.addReport({
              type: 'progress',
              title: `[${worktree.name}] Stack check complete`,
              content: stacked?.isStacked
                ? `Stacked on PR #${stacked.basePR?.number}`
                : 'Not stacked',
            })
          }}
        >
          <StackCheckPhase
            worktreePath={worktree.path}
            pr={pr}
            stacked={stacked}
            onStackedCheck={(s) => db.state.set(stateKey(worktree.name, 'stacked'), s, 'stack-check')}
          />
        </Phase>

        {/* Phase 2: Rebase on origin/main */}
        <Phase
          name="Rebase"
          skipIf={() => noPR || isBlockedByStack}
          onComplete={() => {
            if (rebaseResult?.success) {
              db.vcs.addReport({
                type: 'progress',
                title: `[${worktree.name}] Rebase complete`,
                content: `${rebaseResult.beforeSha.slice(0, 7)} → ${rebaseResult.afterSha.slice(0, 7)}`,
              })
            }
          }}
        >
          <RebasePhase
            worktree={worktree}
            result={rebaseResult}
            onRebaseComplete={(r) => db.state.set(stateKey(worktree.name, 'rebase'), r, 'rebase')}
          />
        </Phase>

        {/* Phase 3: Self-review + handle GH reviews */}
        <Phase
          name="Review"
          skipIf={() => noPR || isBlockedByStack || !rebaseResult?.success}
        >
          <ReviewPhase
            worktree={worktree}
            pr={pr!}
            reviewsHandled={reviewsHandled}
            onReviewsHandled={() =>
              db.state.set(stateKey(worktree.name, 'reviews-handled'), 'true', 'reviews')
            }
          />
        </Phase>

        {/* Phase 4: Final rebase and force push */}
        <Phase
          name="Push"
          skipIf={() => noPR || isBlockedByStack || !rebaseResult?.success}
        >
          <PushPhase
            worktree={worktree}
            result={pushResult}
            onPushComplete={(r) => db.state.set(stateKey(worktree.name, 'push'), r, 'push')}
          />
        </Phase>

        {/* Phase 5: Poll for CI to pass */}
        <Phase
          name="Poll"
          skipIf={() => noPR || isBlockedByStack || !pushResult?.success}
        >
          <PollPhase prNumber={pr?.number ?? 0} pr={pr} />
        </Phase>

        {/* Phase 6: Merge */}
        <Phase
          name="Merge"
          skipIf={() => noPR || isBlockedByStack || !pushResult?.success}
          onComplete={() => {
            if (mergeResult) {
              onComplete?.({
                success: mergeResult.success,
                mergedSha: mergeResult.sha,
                error: mergeResult.error,
              })
            }
          }}
        >
          <MergePhase
            prNumber={pr?.number ?? 0}
            result={mergeResult}
            method={mergeMethod}
            deleteAfterMerge={deleteAfterMerge}
            onMergeComplete={(r) => db.state.set(stateKey(worktree.name, 'merge'), r, 'merge')}
          />
        </Phase>
      </PhaseRegistryProvider>
    </worktree-finalize>
  )
}
