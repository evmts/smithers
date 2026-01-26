/**
 * Debug logging utility for Smithers
 *
 * Enable with DEBUG=true or SMITHERS_DEBUG=true
 * Currently defaults to true since smithers is unstable
 */

// Default to true while smithers is unstable
const DEBUG_ENABLED = process.env['DEBUG'] === 'true' ||
                      process.env['SMITHERS_DEBUG'] === 'true' ||
                      true // TODO: Remove default true when stable

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface DebugOptions {
  /** Component/module name for prefixing */
  prefix: string
  /** Whether to include timestamps */
  timestamp?: boolean
}

class DebugLogger {
  private prefix: string
  private timestamp: boolean

  constructor(options: DebugOptions) {
    this.prefix = options.prefix
    this.timestamp = options.timestamp ?? true
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const ts = this.timestamp ? `[${new Date().toISOString()}]` : ''
    const levelTag = `[${level.toUpperCase()}]`
    const prefixTag = `[${this.prefix}]`

    let formatted = `${ts}${levelTag}${prefixTag} ${message}`
    if (data !== undefined) {
      try {
        const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)
        formatted += `\n${dataStr}`
      } catch {
        formatted += `\n[Unserializable data]`
      }
    }
    return formatted
  }

  debug(message: string, data?: unknown): void {
    if (!DEBUG_ENABLED) return
    console.log(this.formatMessage('debug', message, data))
  }

  info(message: string, data?: unknown): void {
    if (!DEBUG_ENABLED) return
    console.log(this.formatMessage('info', message, data))
  }

  warn(message: string, data?: unknown): void {
    console.warn(this.formatMessage('warn', message, data))
  }

  error(message: string, data?: unknown): void {
    console.error(this.formatMessage('error', message, data))
  }

  /** Log entry into a function/method */
  enter(functionName: string, args?: Record<string, unknown>): void {
    if (!DEBUG_ENABLED) return
    this.debug(`→ ${functionName}`, args)
  }

  /** Log exit from a function/method */
  exit(functionName: string, result?: unknown): void {
    if (!DEBUG_ENABLED) return
    this.debug(`← ${functionName}`, result)
  }

  /** Log a state change */
  state(stateName: string, oldValue: unknown, newValue: unknown): void {
    if (!DEBUG_ENABLED) return
    this.debug(`State change: ${stateName}`, { old: oldValue, new: newValue })
  }

  /** Create a child logger with additional prefix */
  child(childPrefix: string): DebugLogger {
    return new DebugLogger({
      prefix: `${this.prefix}:${childPrefix}`,
      timestamp: this.timestamp,
    })
  }
}

/** Create a debug logger for a component/module */
export function createDebugLogger(prefix: string): DebugLogger {
  return new DebugLogger({ prefix })
}

/** Check if debug mode is enabled */
export function isDebugEnabled(): boolean {
  return DEBUG_ENABLED
}

/** Global smithers logger */
export const smithersLog = createDebugLogger('Smithers')

export type { DebugLogger }
