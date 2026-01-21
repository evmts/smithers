/**
 * Debug and observability utilities
 */

import type { DebugEvent } from '../reconciler/types.js'

export type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface DebugCollector {
  emit(event: DebugEvent): void
}

export type { DebugEvent }

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /password/i,
  /secret/i,
  /credential/i,
  /auth/i,
  /bearer/i,
  /private[_-]?key/i,
]

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(key))
}

export function redactSecrets(obj: unknown, seen = new WeakSet<object>()): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj !== 'object') {
    return obj
  }

  if (seen.has(obj as object)) {
    return '[Circular]'
  }

  seen.add(obj as object)

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isSecretKey(key)) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSecrets(value, seen)
    } else {
      result[key] = value
    }
  }

  return result
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]'
      }
      seen.add(value)
    }
    return value
  })
}

export function createDebugCollector(): DebugCollector {
  return {
    emit(event: DebugEvent): void {
      const redacted = redactSecrets(event)
      const level = (event['level'] as DebugLogLevel) || 'debug'

      switch (level) {
        case 'error':
          console.error('[Debug]', redacted)
          break
        case 'warn':
          console.warn('[Debug]', redacted)
          break
        case 'info':
          console.info('[Debug]', redacted)
          break
        case 'debug':
          console.debug('[Debug]', redacted)
          break
        default:
          console.log('[Debug]', redacted)
      }
    },
  }
}

export { safeStringify }

export interface DebugLogEntry {
  level: DebugLogLevel
  component: string
  message: string
  timestamp: number
  durationMs?: number
  data?: Record<string, unknown>
  error?: Error | undefined
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, error?: Error, data?: Record<string, unknown>): void
  /** Start a timed operation, returns end function that logs duration */
  time(operation: string): () => number
  /** Create a child logger with additional context */
  child(context: Record<string, unknown>): Logger
}

let globalMinLevel: DebugLogLevel = 'info'
const levelPriority: Record<DebugLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export function setLogLevel(level: DebugLogLevel): void {
  globalMinLevel = level
}

export function getLogLevel(): DebugLogLevel {
  return globalMinLevel
}

export function createLogger(component: string, context: Record<string, unknown> = {}): Logger {
  const shouldLog = (level: DebugLogLevel): boolean => {
    return levelPriority[level] >= levelPriority[globalMinLevel]
  }

  const formatEntry = (entry: DebugLogEntry): string => {
    const prefix = `[${entry.component}]`
    const suffix = entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : ''
    const dataStr = entry.data && Object.keys(entry.data).length > 0 
      ? ` ${safeStringify(redactSecrets(entry.data))}` 
      : ''
    return `${prefix} ${entry.message}${suffix}${dataStr}`
  }

  const emit = (level: DebugLogLevel, message: string, data?: Record<string, unknown>, error?: Error): void => {
    if (!shouldLog(level)) return
    
    const entry: DebugLogEntry = {
      level,
      component,
      message,
      timestamp: Date.now(),
      data: { ...context, ...data },
      error,
    }

    const formatted = formatEntry(entry)
    
    switch (level) {
      case 'debug':
        console.debug(formatted)
        break
      case 'info':
        console.log(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
        console.error(formatted, error ?? '')
        break
    }
  }

  const logger: Logger = {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, error, data) => emit('error', message, data, error),
    
    time(operation: string): () => number {
      const start = performance.now()
      return () => {
        const elapsed = Math.round(performance.now() - start)
        emit('debug', `${operation} completed`, { durationMs: elapsed })
        return elapsed
      }
    },

    child(childContext: Record<string, unknown>): Logger {
      return createLogger(component, { ...context, ...childContext })
    },
  }

  return logger
}

/** Wrap an async operation with error logging and optional rethrow */
export async function withErrorLogging<T>(
  logger: Logger,
  operation: string,
  fn: () => Promise<T>,
  options: { rethrow?: boolean; defaultValue?: T } = {}
): Promise<T | undefined> {
  const endTime = logger.time(operation)
  try {
    const result = await fn()
    endTime()
    return result
  } catch (err) {
    endTime()
    const error = err instanceof Error ? err : new Error(String(err))
    logger.error(`${operation} failed`, error)
    if (options.rethrow) throw error
    return options.defaultValue
  }
}
