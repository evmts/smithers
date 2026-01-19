/**
 * useMergeOrder - Hook to determine optimal merge order for stacked PRs
 */

import { useRef } from 'react'
import { useMount } from '../../../src/reconciler/hooks.js'
import type { WorktreeInfo, MergeCandidate, PRInfo } from '../types.js'

export interface UseMergeOrderOptions {
  candidates: WorktreeInfo[]
  cwd: string
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
  const orderRef = useRef<MergeCandidate[]>([])
  const loadingRef = useRef(true)
  const errorRef = useRef<Error | null>(null)

  useMount(() => {
    ;(async () => {
      try {
        const order = await calculateMergeOrder(options.candidates, options.cwd)
        orderRef.current = order
        loadingRef.current = false
        options.onComplete?.(order)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        errorRef.current = error
        loadingRef.current = false
        options.onError?.(error)
      }
    })()
  })

  return {
    mergeOrder: orderRef.current,
    loading: loadingRef.current,
    error: errorRef.current,
  }
}

async function calculateMergeOrder(
  candidates: WorktreeInfo[],
  cwd: string
): Promise<MergeCandidate[]> {
  const mergeables = candidates.filter((c) => c.mergeCandidate)
  const enriched: MergeCandidate[] = []

  for (const wt of mergeables) {
    if (!wt.prNumber) continue

    // Fetch PR details
    const prInfo = await fetchPRInfo(wt.prNumber, cwd)
    if (!prInfo) continue

    // Calculate priority (lower = merge first)
    // Smaller PRs go first, then by update time
    const sizePriority = prInfo.additions + prInfo.deletions
    const timePriority = new Date(prInfo.updatedAt).getTime()

    enriched.push({
      worktree: wt,
      pr: prInfo,
      priority: sizePriority + timePriority / 1e12,
      dependencies: [], // TODO: analyze file dependencies
    })
  }

  // Sort by priority (smaller/older first)
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
