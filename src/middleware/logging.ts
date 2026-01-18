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
      logger({
        type: 'start',
        model: opts.model,
        promptPreview: opts.prompt?.slice(0, 100),
        timestamp: Date.now(),
      })
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
      logger({
        type: 'complete',
        tokensUsed: options?.includeTokens ? result.tokensUsed : undefined,
        durationMs: result.durationMs,
        stopReason: result.stopReason,
        timestamp: Date.now(),
      })
      return result
    },
  }
}
