import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export type LogLevel = 'debug' | 'info' | 'warn'

export interface LogEntry {
  level: LogLevel
  phase: 'start' | 'finish' | 'error'
  type: 'execute'
  options?: CLIExecutionOptions
  durationMs?: number
  tokens?: AgentResult['tokensUsed']
  error?: string
}

export interface LoggingMiddlewareOptions {
  logLevel?: LogLevel
  includeTokens?: boolean
  logFn?: (entry: LogEntry) => void
}

const levelOrder: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
}

export function loggingMiddleware(options: LoggingMiddlewareOptions = {}): SmithersMiddleware {
  const level = options.logLevel ?? 'info'
  const logFn = options.logFn ?? ((entry: LogEntry) => {
    const prefix = `[middleware:${entry.type}] ${entry.phase}`
    if (entry.phase === 'error') {
      console.warn(prefix, entry.error)
    } else if (entry.phase === 'finish') {
      console.log(prefix, entry.durationMs ? `${entry.durationMs}ms` : undefined)
    } else {
      console.log(prefix)
    }
  })

  return {
    name: 'logging',
    transformOptions: (options) => {
      if (levelOrder[level] <= levelOrder.info) {
        logFn({ level, phase: 'start', type: 'execute', options })
      }
      return options
    },
    wrapExecute: async ({ doExecute }) => {
      const start = Date.now()
      try {
        const result = await doExecute()
        const durationMs = Date.now() - start
        if (levelOrder[level] <= levelOrder.info) {
          const entry: LogEntry = { level, phase: 'finish', type: 'execute', durationMs }
          if (options.includeTokens) {
            entry.tokens = result.tokensUsed
          }
          logFn(entry)
        }
        return result
      } catch (error) {
        if (levelOrder[level] <= levelOrder.warn) {
          logFn({
            level: 'warn',
            phase: 'error',
            type: 'execute',
            error: error instanceof Error ? error.message : String(error),
          })
        }
        throw error
      }
    },
  }
}
