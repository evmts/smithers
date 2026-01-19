/**
 * StackedPRMerge - Main workflow component
 *
 * Orchestrates the full stacked PR merge workflow:
 * 1. Status Phase: Gather worktree and PR status, identify merge candidates
 * 2. Order Phase: Determine optimal merge order based on size/dependencies
 * 3. Rebase Phase: Rebase branches into linear stacked history
 * 4. Merge Phase: Cherry-pick and merge to main, close PRs
 *
 * State Management: Uses SQLite-backed state via db.state and useQueryValue
 * for persistence and reactivity. NO useState/useRef for state.
 */

import { useRef, type ReactNode } from 'react'
import { Phase } from '../../src/components/Phase.js'
import { PhaseRegistryProvider } from '../../src/components/PhaseRegistry.js'
import { useSmithers } from '../../src/components/SmithersProvider.js'
import { useMount } from '../../src/reconciler/hooks.js'
import { useQueryValue } from '../../src/reactive-sqlite/index.js'

import { WorktreeStatusPhase } from './components/WorktreeStatusPhase.js'
import { MergeOrderPhase } from './components/MergeOrderPhase.js'
import { StackedRebasePhase } from './components/StackedRebasePhase.js'
import { MergePhase } from './components/MergePhase.js'

import type { WorktreeInfo, MergeCandidate, MergeResult, StackedMergeState } from './types.js'

// State keys for SQLite storage
const STATE_KEYS = {
  worktrees: 'stacked-merge:worktrees',
  candidates: 'stacked-merge:candidates',
  rebaseResults: 'stacked-merge:rebase-results',
  mergeResults: 'stacked-merge:merge-results',
  currentOp: 'stacked-merge:current-op',
  phase: 'stacked-merge:phase',
} as const

export interface StackedPRMergeProps {
  cwd?: string
  targetBranch?: string
  closePRs?: boolean
  skipRebase?: boolean
}

export function StackedPRMerge({
  cwd = process.cwd(),
  targetBranch = 'main',
  closePRs = true,
  skipRebase = false,
}: StackedPRMergeProps): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const hasInitializedRef = useRef(false)

  // SQLite-backed state via useQueryValue (reactive)
  const { data: worktreesJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [STATE_KEYS.worktrees]
  )
  const worktrees: WorktreeInfo[] = worktreesJson ? JSON.parse(worktreesJson) : []

  const { data: candidatesJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [STATE_KEYS.candidates]
  )
  const candidates: MergeCandidate[] = candidatesJson ? JSON.parse(candidatesJson) : []

  const { data: rebaseResultsJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [STATE_KEYS.rebaseResults]
  )
  const rebaseResults: MergeResult[] = rebaseResultsJson ? JSON.parse(rebaseResultsJson) : []

  const { data: mergeResultsJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [STATE_KEYS.mergeResults]
  )
  const mergeResults: MergeResult[] = mergeResultsJson ? JSON.parse(mergeResultsJson) : []

  const { data: currentOp } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [STATE_KEYS.currentOp]
  )

  // Load initial worktree status on mount
  useMount(() => {
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    ;(async () => {
      try {
        const fetchedWorktrees = await fetchAllWorktreeStatus(cwd)
        db.state.set(STATE_KEYS.worktrees, fetchedWorktrees, 'stacked-merge-init')

        const fetchedCandidates = await calculateMergeCandidates(fetchedWorktrees, cwd)
        db.state.set(STATE_KEYS.candidates, fetchedCandidates, 'stacked-merge-init')

        db.vcs.addReport({
          type: 'progress',
          title: 'Worktree analysis complete',
          content: `Found ${fetchedWorktrees.length} worktrees, ${fetchedCandidates.length} merge candidates`,
        })
      } catch (err) {
        console.error('Failed to fetch worktree status:', err)
      }
    })()
  })

  // State update helpers
  const setCandidates = (newCandidates: MergeCandidate[]) => {
    db.state.set(STATE_KEYS.candidates, newCandidates, 'merge-order')
  }

  const setRebaseResults = (results: MergeResult[]) => {
    db.state.set(STATE_KEYS.rebaseResults, results, 'rebase-complete')
  }

  const setMergeResults = (results: MergeResult[]) => {
    db.state.set(STATE_KEYS.mergeResults, results, 'merge-complete')
  }

  const setCurrentOp = (op: string | null) => {
    db.state.set(STATE_KEYS.currentOp, op, 'current-op')
  }

  return (
    <stacked-pr-merge target={targetBranch} close-prs={closePRs}>
      <PhaseRegistryProvider>
        <Phase name="Status" onComplete={() => console.log('[Merge] Status phase complete')}>
          <WorktreeStatusPhase
            worktrees={worktrees}
            onStatusComplete={(newCandidates) => {
              console.log(`[Merge] Found ${newCandidates.length} merge candidates`)
            }}
          />
        </Phase>

        <Phase
          name="Order"
          skipIf={() => candidates.length === 0}
          onComplete={() => console.log('[Merge] Order phase complete')}
        >
          <MergeOrderPhase
            candidates={candidates}
            onOrderDetermined={(order) => {
              setCandidates(order)
              console.log(`[Merge] Merge order determined: ${order.map((c) => c.worktree.name).join(' -> ')}`)
            }}
          />
        </Phase>

        <Phase
          name="Rebase"
          skipIf={() => skipRebase || candidates.length === 0}
          onComplete={() => console.log('[Merge] Rebase phase complete')}
        >
          <StackedRebasePhase
            candidates={candidates}
            targetBranch={targetBranch}
            results={rebaseResults}
            current={currentOp ?? null}
            onRebaseComplete={(results) => {
              setRebaseResults(results)
              setCurrentOp(null)
              const successful = results.filter((r) => r.success).length
              console.log(`[Merge] Rebased ${successful}/${results.length} branches`)
            }}
          />
        </Phase>

        <Phase
          name="Merge"
          skipIf={() => candidates.length === 0}
          onComplete={() => console.log('[Merge] Merge phase complete')}
        >
          <MergePhase
            candidates={candidates}
            targetBranch={targetBranch}
            results={mergeResults}
            current={currentOp ?? null}
            closePRs={closePRs}
          />
        </Phase>
      </PhaseRegistryProvider>
    </stacked-pr-merge>
  )
}

// Helper functions

async function fetchAllWorktreeStatus(cwd: string): Promise<WorktreeInfo[]> {
  const worktreesDir = `${cwd}/.worktrees`

  const result = await Bun.$`ls -1 ${worktreesDir}`.cwd(cwd).quiet()
  if (result.exitCode !== 0) return []

  const entries = result.stdout.toString().trim().split('\n').filter(Boolean)
  const worktrees: WorktreeInfo[] = []

  for (const name of entries) {
    const worktreePath = `${worktreesDir}/${name}`
    const branch = `issue/${name}`

    const checkDir = await Bun.$`test -d ${worktreePath}`.cwd(cwd).quiet()
    if (checkDir.exitCode !== 0) continue

    let hasPR = false
    let prNumber: number | undefined
    let prTitle: string | undefined

    try {
      const prCheck = await Bun.$`gh pr list --head ${branch} --json number,title`.cwd(cwd).quiet()
      const prData = JSON.parse(prCheck.stdout.toString())
      if (prData.length > 0) {
        hasPR = true
        prNumber = prData[0].number
        prTitle = prData[0].title
      }
    } catch {}

    let buildPasses = false
    try {
      const buildCheck = await Bun.$`bun run check`.cwd(worktreePath).quiet()
      buildPasses = buildCheck.exitCode === 0
    } catch {}

    let testsPassing = false
    try {
      const testCheck = await Bun.$`bun test`.cwd(worktreePath).quiet()
      testsPassing = testCheck.exitCode === 0
    } catch {}

    worktrees.push({
      name,
      branch,
      path: worktreePath,
      hasPR,
      prNumber,
      prTitle,
      buildPasses,
      testsPassing,
      mergeCandidate: hasPR && buildPasses && testsPassing,
    })
  }

  return worktrees
}

async function calculateMergeCandidates(
  worktrees: WorktreeInfo[],
  cwd: string
): Promise<MergeCandidate[]> {
  const candidates = worktrees.filter((w) => w.mergeCandidate)
  const enriched: MergeCandidate[] = []

  for (const wt of candidates) {
    if (!wt.prNumber) continue

    try {
      const result =
        await Bun.$`gh pr view ${wt.prNumber} --json number,title,headRefName,baseRefName,updatedAt,additions,deletions,changedFiles`
          .cwd(cwd)
          .quiet()

      const pr = JSON.parse(result.stdout.toString())
      const sizePriority = pr.additions + pr.deletions

      enriched.push({
        worktree: wt,
        pr,
        priority: sizePriority,
        dependencies: [],
      })
    } catch {}
  }

  // Sort by size (smaller first)
  enriched.sort((a, b) => a.priority - b.priority)

  return enriched
}
