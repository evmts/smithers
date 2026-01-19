import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export type LogEntry =
  | {
      type: 'start'
      model?: string
      promptPreview?: string
      timestamp: number
    }
  | {
      type: 'complete'
      tokensUsed?: AgentResult['tokensUsed']
      durationMs?: number
      stopReason?: AgentResult['stopReason']
      timestamp: number
    }
  | {
      type: 'error'
      message: string
      timestamp: number
    }

export function loggingMiddleware(options?: {
  logLevel?: 'debug' | 'info' | 'warn'
  includeTokens?: boolean
  logger?: (entry: LogEntry) => void
}): SmithersMiddleware {
  const logger = options?.logger ?? ((entry: LogEntry) => {
    const label = options?.logLevel ?? 'info'
    if (label === 'warn' && entry.type !== 'error') return
    console.log(entry)
  })

  return {
    name: 'logging',
    transformOptions: (opts: CLIExecutionOptions) => {
      const entry: LogEntry = {
        type: 'start',
        timestamp: Date.now(),
        ...(opts.model !== undefined ? { model: opts.model } : {}),
        ...(opts.prompt !== undefined ? { promptPreview: opts.prompt.slice(0, 100) } : {}),
      }
      logger(entry)
      return opts
    },
    wrapExecute: async (doExecute) => {
      try {
        return await doExecute()
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        logger({
          type: 'error',
          message: err.message,
          timestamp: Date.now(),
        })
        throw err
      }
    },
    transformResult: (result: AgentResult) => {
      const entry: LogEntry = {
        type: 'complete',
        timestamp: Date.now(),
        ...(options?.includeTokens && result.tokensUsed !== undefined
          ? { tokensUsed: result.tokensUsed }
          : {}),
        ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
        ...(result.stopReason !== undefined ? { stopReason: result.stopReason } : {}),
      }
      logger(entry)
      return result
    },
  }
}
