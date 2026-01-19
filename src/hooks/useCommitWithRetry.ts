import { useCallback } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import type { BuildState } from '../db/types.js'

const DEFAULT_WAIT_MS = 5 * 60 * 1000
const DEFAULT_STALE_MS = 15 * 60 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isPrecommitFailure = (message: string): boolean => {
  return /(pre-commit|precommit|hook)/i.test(message)
}

export interface CommitRetryContext {
  state: BuildState
  error: Error
}

export interface CommitRetryOptions {
  waitMs?: number
  staleMs?: number
  onFixRequested?: (context: CommitRetryContext) => void | Promise<void>
}

export function useCommitWithRetry(options: CommitRetryOptions = {}) {
  const smithers = useSmithers()
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS

  return useCallback(
    async <T>(commitOperation: () => Promise<T>): Promise<T> => {
      try {
        return await commitOperation()
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        const stderr = (err as { stderr?: string }).stderr ?? ''
        const stdout = (err as { stdout?: string }).stdout ?? ''
        const combined = [errorObj.message, stderr, stdout].filter(Boolean).join('\n')

        if (!isPrecommitFailure(combined)) {
          throw errorObj
        }

        const agentId = smithers.db.agents.current()?.id ?? 'system'
        const decision = smithers.db.buildState.handleBrokenBuild(agentId, { waitMs, staleMs })

        if (decision.shouldFix) {
          await options.onFixRequested?.({ state: decision.state, error: errorObj })
          const result = await commitOperation()
          smithers.db.buildState.markFixed()
          return result
        }

        await sleep(decision.waitMs)
        const result = await commitOperation()
        smithers.db.buildState.markFixed()
        return result
      }
    },
    [smithers, waitMs, staleMs, options.onFixRequested]
  )
}
