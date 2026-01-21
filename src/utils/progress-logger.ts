/**
 * ProgressLogger - Provides progress logging for orchestrations.
 * Outputs formatted progress messages with timestamps and stats.
 */

export interface ProgressLoggerOptions {
  heartbeatInterval?: number
  prefix?: string
  showElapsed?: boolean
}

export interface ProgressStats {
  phasesCompleted: number
  stepsCompleted: number
  agentsRun: number
  errors: number
}

export class ProgressLogger {
  private readonly prefix: string
  private readonly showElapsed: boolean
  private readonly heartbeatInterval: number
  private readonly startTime: number
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private currentPhase: string | null = null
  private stats: ProgressStats = {
    phasesCompleted: 0,
    stepsCompleted: 0,
    agentsRun: 0,
    errors: 0,
  }

  constructor(options: ProgressLoggerOptions = {}) {
    this.prefix = options.prefix ?? '[Progress]'
    this.showElapsed = options.showElapsed ?? true
    this.heartbeatInterval = options.heartbeatInterval ?? 30000
    this.startTime = Date.now()
  }

  private formatElapsed(): string {
    if (!this.showElapsed) return ''
    const ms = Date.now() - this.startTime
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `[${minutes}m${seconds % 60}s]`
    }
    return `[${seconds}s]`
  }

  private log(message: string): void {
    const elapsed = this.formatElapsed()
    const parts = [this.prefix, elapsed, message].filter(Boolean)
    console.log(parts.join(' '))
  }

  startHeartbeat(): void {
    if (this.heartbeatTimer) return
    this.log('Orchestration started')
    this.heartbeatTimer = setInterval(() => {
      if (this.currentPhase) {
        this.log(`Running: In phase "${this.currentPhase}"`)
      } else {
        this.log('Running: Initializing...')
      }
    }, this.heartbeatInterval)
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  phaseStart(name: string): void {
    this.currentPhase = name
    this.log(`Phase started: ${name}`)
  }

  phaseComplete(name: string): void {
    this.stats.phasesCompleted++
    this.currentPhase = null
    this.log(`Phase complete: ${name}`)
  }

  phaseSkipped(name: string, reason?: string): void {
    const msg = reason ? `Phase skipped: ${name} (${reason})` : `Phase skipped: ${name}`
    this.log(msg)
  }

  stepStart(name: string): void {
    this.log(`Step started: ${name}`)
  }

  stepComplete(name: string): void {
    this.stats.stepsCompleted++
    this.log(`Step complete: ${name}`)
  }

  agentStart(model: string, prompt?: string): void {
    let msg = `Agent started: ${model}`
    if (prompt) {
      const truncated = prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt
      msg += ` - "${truncated}"`
    }
    this.log(msg)
  }

  agentProgress(message: string): void {
    this.log(message)
  }

  agentComplete(model: string, summary?: string): void {
    this.stats.agentsRun++
    let msg = `Agent complete: ${model}`
    if (summary) {
      msg += ` - ${summary}`
    }
    this.log(msg)
  }

  error(message: string, err?: Error): void {
    this.stats.errors++
    let msg = `Error: ${message}`
    if (err) {
      msg += ` - ${err.message}`
    }
    this.log(msg)
  }

  summary(): void {
    this.stopHeartbeat()
    const elapsed = this.formatElapsed()
    console.log(`${this.prefix} === Orchestration Summary ===`)
    console.log(`${this.prefix} Total time: ${elapsed}`)
    console.log(`${this.prefix} Phases completed: ${this.stats.phasesCompleted}`)
    console.log(`${this.prefix} Steps completed: ${this.stats.stepsCompleted}`)
    console.log(`${this.prefix} Agents run: ${this.stats.agentsRun}`)
    console.log(`${this.prefix} Errors: ${this.stats.errors}`)
  }

  getStats(): ProgressStats {
    return { ...this.stats }
  }
}

// Singleton instance
let globalLogger: ProgressLogger | null = null

export function getProgressLogger(options?: ProgressLoggerOptions): ProgressLogger {
  if (!globalLogger) {
    globalLogger = new ProgressLogger(options)
  }
  return globalLogger
}

export function resetProgressLogger(): void {
  if (globalLogger) {
    globalLogger.stopHeartbeat()
    globalLogger = null
  }
}
