/**
 * useWorktreeStatus - Hook to fetch worktree build/test status
 *
 * State Management: Uses SQLite-backed state via db.state and useQueryValue
 * for persistence and reactivity. NO useState/useRef for state.
 */

import { useRef } from 'react'
import { useSmithers } from '../../../src/components/SmithersProvider.js'
import { useMount } from '../../../src/reconciler/hooks.js'
import { useQueryValue } from '../../../src/reactive-sqlite/index.js'
import type { WorktreeInfo } from '../types.js'

const STATE_KEYS = {
  worktrees: 'worktree-status:worktrees',
  loading: 'worktree-status:loading',
  error: 'worktree-status:error',
} as const

export interface UseWorktreeStatusOptions {
  cwd: string
  statePrefix?: string
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
  const { db, reactiveDb } = useSmithers()
  const prefix = options.statePrefix ?? 'worktree-status'
  const hasStartedRef = useRef(false)

  // SQLite-backed state (reactive)
  const { data: worktreesJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [`${prefix}:worktrees`]
  )
  const worktrees: WorktreeInfo[] = worktreesJson ? JSON.parse(worktreesJson) : []

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

    // Initialize loading state
    db.state.set(`${prefix}:loading`, 'true', 'worktree-status-init')

    ;(async () => {
      try {
        const fetchedWorktrees = await fetchWorktreeStatus(options.cwd)
        db.state.set(`${prefix}:worktrees`, fetchedWorktrees, 'worktree-status-complete')
        db.state.set(`${prefix}:loading`, 'false', 'worktree-status-complete')
        options.onComplete?.(fetchedWorktrees)
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        db.state.set(`${prefix}:error`, errorObj.message, 'worktree-status-error')
        db.state.set(`${prefix}:loading`, 'false', 'worktree-status-error')
        options.onError?.(errorObj)
      }
    })()
  })

  return { worktrees, loading, error }
}

async function fetchWorktreeStatus(cwd: string): Promise<WorktreeInfo[]> {
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
