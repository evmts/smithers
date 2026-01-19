/**
 * useCherryPickMerge - Hook to cherry-pick and merge PRs to main
 */

import { useRef } from 'react'
import { useSmithers } from '../../../src/components/SmithersProvider.js'
import { useMount } from '../../../src/reconciler/hooks.js'
import type { MergeCandidate, MergeResult } from '../types.js'

export interface UseCherryPickMergeOptions {
  mergeOrder: MergeCandidate[]
  targetBranch: string
  cwd: string
  closePRs?: boolean
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
  const { db } = useSmithers()
  const resultsRef = useRef<MergeResult[]>([])
  const currentRef = useRef<string | null>(null)
  const loadingRef = useRef(true)
  const errorRef = useRef<Error | null>(null)

  useMount(() => {
    ;(async () => {
      const results: MergeResult[] = []

      try {
        // Ensure we're on target branch
        await Bun.$`git checkout ${options.targetBranch}`.cwd(options.cwd).quiet()
        await Bun.$`git pull origin ${options.targetBranch}`.cwd(options.cwd).quiet()

        for (let i = 0; i < options.mergeOrder.length; i++) {
          const candidate = options.mergeOrder[i]
          const branch = candidate.worktree.branch
          currentRef.current = candidate.worktree.name

          options.onProgress?.(candidate.worktree.name, i, options.mergeOrder.length)

          db.vcs.addReport({
            type: 'progress',
            title: `Cherry-picking ${branch}`,
            content: `Merging to ${options.targetBranch}`,
          })

          try {
            // Get commits unique to this branch
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
              results.push({
                name: candidate.worktree.name,
                success: true,
                commitSha: 'no-commits',
              })
              continue
            }

            // Cherry-pick each commit
            for (const commit of commits) {
              const pickResult = await Bun.$`git cherry-pick ${commit}`.cwd(options.cwd).quiet()

              if (pickResult.exitCode !== 0) {
                // Try to resolve with theirs strategy
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

            // Get final commit SHA
            const shaResult = await Bun.$`git rev-parse HEAD`.cwd(options.cwd).quiet()
            const commitSha = shaResult.stdout.toString().trim()

            // Close PR if requested
            if (options.closePRs && candidate.pr.number) {
              await Bun.$`gh pr close ${candidate.pr.number} --comment "Cherry-picked to ${options.targetBranch} in commit ${commitSha}"`
                .cwd(options.cwd)
                .quiet()
            }

            results.push({
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
            const error = err instanceof Error ? err : new Error(String(err))
            results.push({
              name: candidate.worktree.name,
              success: false,
              error: error.message,
            })

            db.vcs.addReport({
              type: 'error',
              title: `Merge failed: ${branch}`,
              content: error.message,
              severity: 'warning',
            })

            // Continue with next PR - don't block on one failure
          }
        }

        // Push all changes
        await Bun.$`git push origin ${options.targetBranch}`.cwd(options.cwd).quiet()

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
