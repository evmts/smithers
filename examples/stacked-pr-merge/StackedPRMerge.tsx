/**
 * StackedPRMerge - Main workflow component
 *
 * Orchestrates the full stacked PR merge workflow:
 * 1. Status Phase: Gather worktree and PR status, identify merge candidates
 * 2. Order Phase: Determine optimal merge order based on size/dependencies
 * 3. Rebase Phase: Rebase branches into linear stacked history
 * 4. Merge Phase: Cherry-pick and merge to main, close PRs
 */

import { useRef, type ReactNode } from 'react'
import { Phase } from '../../src/components/Phase.js'
import { PhaseRegistryProvider } from '../../src/components/PhaseRegistry.js'
import { useSmithers } from '../../src/components/SmithersProvider.js'
import { useMount } from '../../src/reconciler/hooks.js'

import { WorktreeStatusPhase } from './components/WorktreeStatusPhase.js'
import { MergeOrderPhase } from './components/MergeOrderPhase.js'
import { StackedRebasePhase } from './components/StackedRebasePhase.js'
import { MergePhase } from './components/MergePhase.js'

import type { WorktreeInfo, MergeCandidate, MergeResult, StackedMergeState } from './types.js'

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
  const { db } = useSmithers()

  // State refs for workflow data
  const worktreesRef = useRef<WorktreeInfo[]>([])
  const candidatesRef = useRef<MergeCandidate[]>([])
  const rebaseResultsRef = useRef<MergeResult[]>([])
  const mergeResultsRef = useRef<MergeResult[]>([])
  const currentOpRef = useRef<string | null>(null)

  // Load initial worktree status on mount
  useMount(() => {
    ;(async () => {
      try {
        const worktrees = await fetchAllWorktreeStatus(cwd)
        worktreesRef.current = worktrees

        // Calculate merge candidates with order
        const candidates = await calculateMergeCandidates(worktrees, cwd)
        candidatesRef.current = candidates

        db.vcs.addReport({
          type: 'progress',
          title: 'Worktree analysis complete',
          content: `Found ${worktrees.length} worktrees, ${candidates.length} merge candidates`,
        })
      } catch (err) {
        console.error('Failed to fetch worktree status:', err)
      }
    })()
  })

  return (
    <stacked-pr-merge target={targetBranch} close-prs={closePRs}>
      <PhaseRegistryProvider>
        <Phase name="Status" onComplete={() => console.log('[Merge] Status phase complete')}>
          <WorktreeStatusPhase
            worktrees={worktreesRef.current}
            onStatusComplete={(candidates) => {
              console.log(`[Merge] Found ${candidates.length} merge candidates`)
            }}
          />
        </Phase>

        <Phase
          name="Order"
          skipIf={() => candidatesRef.current.length === 0}
          onComplete={() => console.log('[Merge] Order phase complete')}
        >
          <MergeOrderPhase
            candidates={candidatesRef.current}
            onOrderDetermined={(order) => {
              candidatesRef.current = order
              console.log(`[Merge] Merge order determined: ${order.map((c) => c.worktree.name).join(' -> ')}`)
            }}
          />
        </Phase>

        <Phase
          name="Rebase"
          skipIf={() => skipRebase || candidatesRef.current.length === 0}
          onComplete={() => console.log('[Merge] Rebase phase complete')}
        >
          <StackedRebasePhase
            candidates={candidatesRef.current}
            targetBranch={targetBranch}
            results={rebaseResultsRef.current}
            current={currentOpRef.current}
            onRebaseComplete={(results) => {
              rebaseResultsRef.current = results
              const successful = results.filter((r) => r.success).length
              console.log(`[Merge] Rebased ${successful}/${results.length} branches`)
            }}
          />
        </Phase>

        <Phase
          name="Merge"
          skipIf={() => candidatesRef.current.length === 0}
          onComplete={() => console.log('[Merge] Merge phase complete')}
        >
          <MergePhase
            candidates={candidatesRef.current}
            targetBranch={targetBranch}
            results={mergeResultsRef.current}
            current={currentOpRef.current}
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
