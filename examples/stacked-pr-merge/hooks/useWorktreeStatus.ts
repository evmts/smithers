/**
 * useWorktreeStatus - Hook to fetch worktree build/test status
 */

import { useRef } from 'react'
import { useMount } from '../../../src/reconciler/hooks.js'
import type { WorktreeInfo } from '../types.js'

export interface UseWorktreeStatusOptions {
  cwd: string
  onComplete?: (worktrees: WorktreeInfo[]) => void
  onError?: (error: Error) => void
}

/**
 * Fetches status for all worktrees including build/test results and PR status
 */
export function useWorktreeStatus(options: UseWorktreeStatusOptions): {
  worktrees: WorktreeInfo[]
  loading: boolean
  error: Error | null
} {
  const worktreesRef = useRef<WorktreeInfo[]>([])
  const loadingRef = useRef(true)
  const errorRef = useRef<Error | null>(null)

  useMount(() => {
    ;(async () => {
      try {
        const worktrees = await fetchWorktreeStatus(options.cwd)
        worktreesRef.current = worktrees
        loadingRef.current = false
        options.onComplete?.(worktrees)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        errorRef.current = error
        loadingRef.current = false
        options.onError?.(error)
      }
    })()
  })

  return {
    worktrees: worktreesRef.current,
    loading: loadingRef.current,
    error: errorRef.current,
  }
}

async function fetchWorktreeStatus(cwd: string): Promise<WorktreeInfo[]> {
  const worktreesDir = `${cwd}/.worktrees`

  // List worktree directories
  const result = await Bun.$`ls -1 ${worktreesDir}`.cwd(cwd).quiet()
  if (result.exitCode !== 0) return []

  const entries = result.stdout.toString().trim().split('\n').filter(Boolean)
  const worktrees: WorktreeInfo[] = []

  for (const name of entries) {
    const worktreePath = `${worktreesDir}/${name}`
    const branch = `issue/${name}`

    // Check if directory exists
    const checkDir = await Bun.$`test -d ${worktreePath}`.cwd(cwd).quiet()
    if (checkDir.exitCode !== 0) continue

    // Check PR status
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
    } catch {
      // No PR or gh command failed
    }

    // Check build status
    let buildPasses = false
    try {
      const buildCheck = await Bun.$`bun run check`.cwd(worktreePath).quiet()
      buildPasses = buildCheck.exitCode === 0
    } catch {
      buildPasses = false
    }

    // Check test status
    let testsPassing = false
    try {
      const testCheck = await Bun.$`bun test`.cwd(worktreePath).quiet()
      testsPassing = testCheck.exitCode === 0
    } catch {
      testsPassing = false
    }

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
