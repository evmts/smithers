/**
 * useCherryPickMerge - Hook to cherry-pick and merge PRs to main
 *
 * State Management: Uses SQLite-backed state via db.state and useQueryValue
 * for persistence and reactivity. NO useState/useRef for state.
 */

import { useRef } from 'react'
import { useSmithers } from '../../../src/components/SmithersProvider.js'
import { useMount } from '../../../src/reconciler/hooks.js'
import { useQueryValue } from '../../../src/reactive-sqlite/index.js'
import type { MergeCandidate, MergeResult } from '../types.js'

export interface UseCherryPickMergeOptions {
  mergeOrder: MergeCandidate[]
  targetBranch: string
  cwd: string
  closePRs?: boolean
  statePrefix?: string
  onProgress?: (current: string, completed: number, total: number) => void
  onComplete?: (results: MergeResult[]) => void
  onError?: (error: Error) => void
}

/**
 * Cherry-picks commits from each branch onto target, closing PRs after
 */
export function useCherryPickMerge(options: UseCherryPickMergeOptions): {
  results: MergeResult[]
  current: string | null
  loading: boolean
  error: Error | null
} {
  const { db, reactiveDb } = useSmithers()
  const prefix = options.statePrefix ?? 'cherry-pick-merge'
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

    db.state.set(`${prefix}:loading`, 'true', 'cherry-pick-init')

    ;(async () => {
      const mergeResults: MergeResult[] = []

      try {
        await Bun.$`git checkout ${options.targetBranch}`.cwd(options.cwd).quiet()
        await Bun.$`git pull origin ${options.targetBranch}`.cwd(options.cwd).quiet()

        for (let i = 0; i < options.mergeOrder.length; i++) {
          const candidate = options.mergeOrder[i]
          if (!candidate) continue
          
          const branch = candidate.worktree.branch
          db.state.set(`${prefix}:current`, candidate.worktree.name, 'cherry-pick-progress')

          options.onProgress?.(candidate.worktree.name, i, options.mergeOrder.length)

          db.vcs.addReport({
            type: 'progress',
            title: `Cherry-picking ${branch}`,
            content: `Merging to ${options.targetBranch}`,
          })

          try {
            const logResult =
              await Bun.$`git log ${options.targetBranch}..${branch} --oneline --reverse`
                .cwd(options.cwd)
                .quiet()

            const commits = logResult.stdout
              .toString()
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line) => line.split(' ')[0])

            if (commits.length === 0) {
              mergeResults.push({
                name: candidate.worktree.name,
                success: true,
                commitSha: 'no-commits',
              })
              continue
            }

            for (const commit of commits) {
              if (!commit) continue
              
              const pickResult = await Bun.$`git cherry-pick ${commit}`.cwd(options.cwd).quiet()

              if (pickResult.exitCode !== 0) {
                await Bun.$`git checkout --theirs .`.cwd(options.cwd).quiet()
                await Bun.$`git add -A`.cwd(options.cwd).quiet()

                const continueResult =
                  await Bun.$`GIT_EDITOR=true git cherry-pick --continue`
                    .cwd(options.cwd)
                    .quiet()

                if (continueResult.exitCode !== 0) {
                  await Bun.$`git cherry-pick --abort`.cwd(options.cwd).quiet()
                  throw new Error(`Cherry-pick conflict on commit ${commit}`)
                }
              }
            }

            const shaResult = await Bun.$`git rev-parse HEAD`.cwd(options.cwd).quiet()
            const commitSha = shaResult.stdout.toString().trim()

            if (options.closePRs && candidate.pr.number) {
              await Bun.$`gh pr close ${candidate.pr.number} --comment "Cherry-picked to ${options.targetBranch} in commit ${commitSha}"`
                .cwd(options.cwd)
                .quiet()
            }

            mergeResults.push({
              name: candidate.worktree.name,
              success: true,
              commitSha,
            })

            db.vcs.addReport({
              type: 'success',
              title: `Merged ${branch}`,
              content: `Commit: ${commitSha}`,
            })
          } catch (err) {
            const errorObj = err instanceof Error ? err : new Error(String(err))
            mergeResults.push({
              name: candidate.worktree.name,
              success: false,
              error: errorObj.message,
            })

            db.vcs.addReport({
              type: 'error',
              title: `Merge failed: ${branch}`,
              content: errorObj.message,
              severity: 'warning',
            })
          }

          // Update results after each merge
          db.state.set(`${prefix}:results`, mergeResults, 'cherry-pick-progress')
        }

        await Bun.$`git push origin ${options.targetBranch}`.cwd(options.cwd).quiet()

        db.state.set(`${prefix}:results`, mergeResults, 'cherry-pick-complete')
        db.state.set(`${prefix}:current`, null, 'cherry-pick-complete')
        db.state.set(`${prefix}:loading`, 'false', 'cherry-pick-complete')
        options.onComplete?.(mergeResults)
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        db.state.set(`${prefix}:error`, errorObj.message, 'cherry-pick-error')
        db.state.set(`${prefix}:loading`, 'false', 'cherry-pick-error')
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
