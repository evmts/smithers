/**
 * Progress Logger Utility
 *
 * Provides visibility into long-running orchestrations with:
 * - Periodic heartbeat logging (configurable interval)
 * - Phase/step transition announcements
 * - Elapsed time tracking
 * - Summary statistics
 */

export interface ProgressLoggerOptions {
  /** Heartbeat interval in ms (default: 30000 = 30s) */
  heartbeatInterval?: number
  /** Prefix for all log messages */
  prefix?: string
  /** Whether to show elapsed time */
  showElapsed?: boolean
}

export interface ProgressStats {
  phasesCompleted: number
  stepsCompleted: number
  agentsRun: number
  errors: number
}

export class ProgressLogger {
  private startTime: number
  private heartbeatInterval: number
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private prefix: string
  private showElapsed: boolean
  private currentPhase: string | null = null
  private currentStep: string | null = null
  private stats: ProgressStats = {
    phasesCompleted: 0,
    stepsCompleted: 0,
    agentsRun: 0,
    errors: 0,
  }

  constructor(options: ProgressLoggerOptions = {}) {
    this.startTime = Date.now()
    this.heartbeatInterval = options.heartbeatInterval ?? 30000
    this.prefix = options.prefix ?? '[Progress]'
    this.showElapsed = options.showElapsed ?? true
  }

  private elapsed(): string {
    const ms = Date.now() - this.startTime
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}m${seconds % 60}s`
    }
    return `${seconds}s`
  }

  private log(message: string, data?: Record<string, unknown>): void {
    const timePrefix = this.showElapsed ? `[${this.elapsed()}]` : ''
    const dataStr = data ? ` ${JSON.stringify(data)}` : ''
    console.log(`${this.prefix}${timePrefix} ${message}${dataStr}`)
  }

  /** Start the heartbeat timer */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return

    this.log('Orchestration started')
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat()
    }, this.heartbeatInterval)
  }

  /** Stop the heartbeat timer */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** Log a heartbeat with current status */
  private heartbeat(): void {
    const status = this.currentStep
      ? `Running: ${this.currentPhase}/${this.currentStep}`
      : this.currentPhase
        ? `In phase: ${this.currentPhase}`
        : 'Initializing...'

    this.log(`💓 ${status}`, this.stats as unknown as Record<string, unknown>)
  }

  /** Log phase start */
  phaseStart(name: string): void {
    this.currentPhase = name
    this.currentStep = null
    this.log(`📦 Phase started: ${name}`)
  }

  /** Log phase complete */
  phaseComplete(name: string): void {
    this.stats.phasesCompleted++
    this.log(`✅ Phase complete: ${name}`)
    this.currentPhase = null
  }

  /** Log phase skipped */
  phaseSkipped(name: string, reason?: string): void {
    this.log(`⏭️  Phase skipped: ${name}${reason ? ` (${reason})` : ''}`)
  }

  /** Log step start */
  stepStart(name: string): void {
    this.currentStep = name
    this.log(`  📝 Step started: ${name}`)
  }

  /** Log step complete */
  stepComplete(name: string): void {
    this.stats.stepsCompleted++
    this.log(`  ✅ Step complete: ${name}`)
    this.currentStep = null
  }

  /** Log agent start */
  agentStart(model: string, prompt?: string): void {
    const truncated = prompt && prompt.length > 100
      ? prompt.slice(0, 100) + '...'
      : prompt
    this.log(`    🤖 Agent started: ${model}${truncated ? ` - "${truncated}"` : ''}`)
  }

  /** Log agent progress */
  agentProgress(message: string): void {
    this.log(`    ⏳ ${message}`)
  }

  /** Log agent complete */
  agentComplete(model: string, summary?: string): void {
    this.stats.agentsRun++
    this.log(`    ✅ Agent complete: ${model}${summary ? ` - ${summary}` : ''}`)
  }

  /** Log error */
  error(message: string, error?: Error): void {
    this.stats.errors++
    this.log(`❌ Error: ${message}${error ? ` - ${error.message}` : ''}`)
  }

  /** Log final summary */
  summary(): void {
    this.stopHeartbeat()
    this.log('═'.repeat(50))
    this.log('Orchestration Summary', this.stats as unknown as Record<string, unknown>)
    this.log(`Total time: ${this.elapsed()}`)
    this.log('═'.repeat(50))
  }

  /** Get current stats */
  getStats(): ProgressStats {
    return { ...this.stats }
  }
}

/** Global progress logger instance for scripts */
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
