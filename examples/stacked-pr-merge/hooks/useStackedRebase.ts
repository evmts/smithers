/**
 * useStackedRebase - Hook to rebase branches into stacked linear history
 */

import { useRef } from 'react'
import { useSmithers } from '../../../src/components/SmithersProvider.js'
import { useMount } from '../../../src/reconciler/hooks.js'
import type { MergeCandidate, MergeResult } from '../types.js'

export interface UseStackedRebaseOptions {
  mergeOrder: MergeCandidate[]
  targetBranch: string
  cwd: string
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
  const { db } = useSmithers()
  const resultsRef = useRef<MergeResult[]>([])
  const currentRef = useRef<string | null>(null)
  const loadingRef = useRef(true)
  const errorRef = useRef<Error | null>(null)

  useMount(() => {
    ;(async () => {
      const results: MergeResult[] = []
      let previousBranch = options.targetBranch

      try {
        for (let i = 0; i < options.mergeOrder.length; i++) {
          const candidate = options.mergeOrder[i]
          const branch = candidate.worktree.branch
          currentRef.current = candidate.worktree.name

          options.onProgress?.(candidate.worktree.name, i, options.mergeOrder.length)

          // Log to database
          db.vcs.addReport({
            type: 'progress',
            title: `Rebasing ${branch}`,
            content: `Rebasing onto ${previousBranch}`,
          })

          try {
            // Checkout the branch
            await Bun.$`git checkout ${branch}`.cwd(options.cwd).quiet()

            // Rebase onto previous branch
            const rebaseResult = await Bun.$`git rebase ${previousBranch}`.cwd(options.cwd).quiet()

            if (rebaseResult.exitCode !== 0) {
              // Abort on conflict
              await Bun.$`git rebase --abort`.cwd(options.cwd).quiet()
              throw new Error(`Rebase conflict on ${branch}`)
            }

            // Get commit SHA
            const shaResult = await Bun.$`git rev-parse HEAD`.cwd(options.cwd).quiet()
            const commitSha = shaResult.stdout.toString().trim()

            // Force push the rebased branch
            await Bun.$`git push --force-with-lease origin ${branch}`.cwd(options.cwd).quiet()

            results.push({
              name: candidate.worktree.name,
              success: true,
              commitSha,
            })

            // This branch becomes the base for the next
            previousBranch = branch
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            results.push({
              name: candidate.worktree.name,
              success: false,
              error: error.message,
            })

            db.vcs.addReport({
              type: 'error',
              title: `Rebase failed: ${branch}`,
              content: error.message,
              severity: 'error',
            })

            // Don't continue - subsequent rebases would fail
            break
          }
        }

        // Return to target branch
        await Bun.$`git checkout ${options.targetBranch}`.cwd(options.cwd).quiet()

        resultsRef.current = results
        currentRef.current = null
        loadingRef.current = false
        options.onComplete?.(results)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        errorRef.current = error
        loadingRef.current = false
        options.onError?.(error)
      }
    })()
  })

  return {
    results: resultsRef.current,
    current: currentRef.current,
    loading: loadingRef.current,
    error: errorRef.current,
  }
}
