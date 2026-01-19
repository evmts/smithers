/**
 * useStackedRebase - Hook to rebase branches into stacked linear history
 *
 * State Management: Uses SQLite-backed state via db.state and useQueryValue
 * for persistence and reactivity. NO useState/useRef for state.
 */

import { useRef } from 'react'
import { useSmithers } from '../../../src/components/SmithersProvider.js'
import { useMount } from '../../../src/reconciler/hooks.js'
import { useQueryValue } from '../../../src/reactive-sqlite/index.js'
import type { MergeCandidate, MergeResult } from '../types.js'

export interface UseStackedRebaseOptions {
  mergeOrder: MergeCandidate[]
  targetBranch: string
  cwd: string
  statePrefix?: string
  onProgress?: (current: string, completed: number, total: number) => void
  onComplete?: (results: MergeResult[]) => void
  onError?: (error: Error) => void
}

/**
 * Rebases each branch onto the previous in order, creating a linear stacked history
 */
export function useStackedRebase(options: UseStackedRebaseOptions): {
  results: MergeResult[]
  current: string | null
  loading: boolean
  error: Error | null
} {
  const { db, reactiveDb } = useSmithers()
  const prefix = options.statePrefix ?? 'stacked-rebase'
  const hasStartedRef = useRef(false)

  // SQLite-backed state (reactive)
  const { data: resultsJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [`${prefix}:results`]
  )
  const results: MergeResult[] = resultsJson ? JSON.parse(resultsJson) : []

  const { data: current } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [`${prefix}:current`]
  )

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

    db.state.set(`${prefix}:loading`, 'true', 'stacked-rebase-init')

    ;(async () => {
      const rebaseResults: MergeResult[] = []
      let previousBranch = options.targetBranch

      try {
        for (let i = 0; i < options.mergeOrder.length; i++) {
          const candidate = options.mergeOrder[i]
          if (!candidate) continue
          
          const branch = candidate.worktree.branch
          db.state.set(`${prefix}:current`, candidate.worktree.name, 'rebase-progress')

          options.onProgress?.(candidate.worktree.name, i, options.mergeOrder.length)

          db.vcs.addReport({
            type: 'progress',
            title: `Rebasing ${branch}`,
            content: `Rebasing onto ${previousBranch}`,
          })

          try {
            await Bun.$`git checkout ${branch}`.cwd(options.cwd).quiet()

            const rebaseResult = await Bun.$`git rebase ${previousBranch}`.cwd(options.cwd).quiet()

            if (rebaseResult.exitCode !== 0) {
              await Bun.$`git rebase --abort`.cwd(options.cwd).quiet()
              throw new Error(`Rebase conflict on ${branch}`)
            }

            const shaResult = await Bun.$`git rev-parse HEAD`.cwd(options.cwd).quiet()
            const commitSha = shaResult.stdout.toString().trim()

            await Bun.$`git push --force-with-lease origin ${branch}`.cwd(options.cwd).quiet()

            rebaseResults.push({
              name: candidate.worktree.name,
              success: true,
              commitSha,
            })

            previousBranch = branch
          } catch (err) {
            const errorObj = err instanceof Error ? err : new Error(String(err))
            rebaseResults.push({
              name: candidate.worktree.name,
              success: false,
              error: errorObj.message,
            })

            db.vcs.addReport({
              type: 'error',
              title: `Rebase failed: ${branch}`,
              content: errorObj.message,
              severity: 'error',
            })

            break
          }

          // Update results in DB after each rebase
          db.state.set(`${prefix}:results`, rebaseResults, 'rebase-progress')
        }

        await Bun.$`git checkout ${options.targetBranch}`.cwd(options.cwd).quiet()

        db.state.set(`${prefix}:results`, rebaseResults, 'stacked-rebase-complete')
        db.state.set(`${prefix}:current`, null, 'stacked-rebase-complete')
        db.state.set(`${prefix}:loading`, 'false', 'stacked-rebase-complete')
        options.onComplete?.(rebaseResults)
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        db.state.set(`${prefix}:error`, errorObj.message, 'stacked-rebase-error')
        db.state.set(`${prefix}:loading`, 'false', 'stacked-rebase-error')
        options.onError?.(errorObj)
      }
    })()
  })

  return {
    results,
    current: current ?? null,
    loading,
    error,
  }
}
