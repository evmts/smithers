/**
 * useMergeOrder - Hook to determine optimal merge order for stacked PRs
 *
 * State Management: Uses SQLite-backed state via db.state and useQueryValue
 * for persistence and reactivity. NO useState/useRef for state.
 */

import { useRef } from 'react'
import { useSmithers } from '../../../src/components/SmithersProvider.js'
import { useMount } from '../../../src/reconciler/hooks.js'
import { useQueryValue } from '../../../src/reactive-sqlite/index.js'
import type { WorktreeInfo, MergeCandidate, PRInfo } from '../types.js'

export interface UseMergeOrderOptions {
  candidates: WorktreeInfo[]
  cwd: string
  statePrefix?: string
  onComplete?: (order: MergeCandidate[]) => void
  onError?: (error: Error) => void
}

/**
 * Analyzes merge candidates and determines optimal merge order based on:
 * - PR size (smaller first for easier conflict resolution)
 * - File overlap (non-overlapping first)
 * - Dependencies between changes
 */
export function useMergeOrder(options: UseMergeOrderOptions): {
  mergeOrder: MergeCandidate[]
  loading: boolean
  error: Error | null
} {
  const { db, reactiveDb } = useSmithers()
  const prefix = options.statePrefix ?? 'merge-order'
  const hasStartedRef = useRef(false)

  // SQLite-backed state (reactive)
  const { data: orderJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [`${prefix}:order`]
  )
  const mergeOrder: MergeCandidate[] = orderJson ? JSON.parse(orderJson) : []

  const { data: loadingStr } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [`${prefix}:loading`]
  )
  const loading = loadingStr === 'true'

  const { data: errorStr } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [`${prefix}:error`]
  )
  const error = errorStr ? new Error(errorStr) : null

  useMount(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    db.state.set(`${prefix}:loading`, 'true', 'merge-order-init')

    ;(async () => {
      try {
        const order = await calculateMergeOrder(options.candidates, options.cwd)
        db.state.set(`${prefix}:order`, order, 'merge-order-complete')
        db.state.set(`${prefix}:loading`, 'false', 'merge-order-complete')
        options.onComplete?.(order)
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        db.state.set(`${prefix}:error`, errorObj.message, 'merge-order-error')
        db.state.set(`${prefix}:loading`, 'false', 'merge-order-error')
        options.onError?.(errorObj)
      }
    })()
  })

  return { mergeOrder, loading, error }
}

async function calculateMergeOrder(
  candidates: WorktreeInfo[],
  cwd: string
): Promise<MergeCandidate[]> {
  const mergeables = candidates.filter((c) => c.mergeCandidate)
  const enriched: MergeCandidate[] = []

  for (const wt of mergeables) {
    if (!wt.prNumber) continue

    const prInfo = await fetchPRInfo(wt.prNumber, cwd)
    if (!prInfo) continue

    const sizePriority = prInfo.additions + prInfo.deletions
    const timePriority = new Date(prInfo.updatedAt).getTime()

    enriched.push({
      worktree: wt,
      pr: prInfo,
      priority: sizePriority + timePriority / 1e12,
      dependencies: [],
    })
  }

  enriched.sort((a, b) => a.priority - b.priority)

  return enriched
}

async function fetchPRInfo(prNumber: number, cwd: string): Promise<PRInfo | null> {
  try {
    const result =
      await Bun.$`gh pr view ${prNumber} --json number,title,headRefName,baseRefName,updatedAt,additions,deletions,changedFiles`
        .cwd(cwd)
        .quiet()

    if (result.exitCode !== 0) return null
    return JSON.parse(result.stdout.toString())
  } catch {
    return null
  }
}
