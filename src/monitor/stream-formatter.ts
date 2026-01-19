import type { ParsedEvent } from './output-parser.js'

export interface FormatterStats {
  phasesCompleted: number
  agentsExecuted: number
  toolCalls: number
  errors: number
  startTime: Date
}

export class StreamFormatter {
  private stats: FormatterStats
  private lastLogMessage: string | null = null

  constructor() {
    this.stats = {
      phasesCompleted: 0,
      agentsExecuted: 0,
      toolCalls: 0,
      errors: 0,
      startTime: new Date(),
    }
  }

  formatHeader(file: string): string {
    const safeFile = this.truncateText(file.replace(/[\r\n]+/g, ' '), 41)
    const lines = [
      '╔══════════════════════════════════════════════════════════════════╗',
      '║                    SMITHERS MONITOR v1.0                         ║',
      `║                    File: ${safeFile.padEnd(41)} ║`,
      `║                    Started: ${this.stats.startTime.toISOString().replace('T', ' ').substring(0, 19).padEnd(37)} ║`,
      '╚══════════════════════════════════════════════════════════════════╝',
      '',
    ]
    return lines.join('\n')
  }

  formatEvent(event: ParsedEvent, logPath?: string, summary?: string): string {
    const time = this.formatTime(event.timestamp)
    let output = ''

    switch (event.type) {
      case 'phase':
        if (event.data['status'] === 'COMPLETE') {
          this.stats.phasesCompleted++
        }
        output = this.formatPhase(time, event.data['name'], event.data['status'])
        break

      case 'agent':
        if (event.data['status'] === 'COMPLETE') {
          this.stats.agentsExecuted++
        }
        output = this.formatAgent(time, event.data['name'], event.data['status'])
        break

      case 'tool':
        this.stats.toolCalls++
        output = this.formatTool(time, event.data['name'], event.data['details'], logPath, summary)
        break

      case 'ralph':
        output = this.formatRalph(time, event.data['iteration'])
        break

      case 'error':
        this.stats.errors++
        output = this.formatError(time, event.data['message'], logPath)
        break

      case 'log':
        if (event.data['message'] !== this.lastLogMessage) {
          output = this.formatLog(event.data['message'])
        }
        this.lastLogMessage = event.data['message'] ?? null
        break

      default:
        output = this.formatLog(event.raw)
    }

    if (event.type !== 'log') {
      this.lastLogMessage = null
    }
    return output
  }

  private formatPhase(time: string, name: string, status: string): string {
    const symbol = status === 'COMPLETE' ? '✓' : '◆'
    return `[${time}] ${symbol} PHASE: ${name}\n           Status: ${status}\n`
  }

  private formatAgent(time: string, name: string, status: string): string {
    const symbol = status === 'COMPLETE' ? '✓' : '●'
    return `[${time}] ${symbol} AGENT: ${name}\n           Status: ${status}\n`
  }

  private formatTool(
    time: string,
    name: string,
    details: string,
    logPath?: string,
    summary?: string
  ): string {
    let output = `[${time}] ⚡ TOOL CALL: ${name}\n`
    if (details) {
      output += `           ${details}\n`
    }
    if (summary) {
      output += `           ${'─'.repeat(60)}\n`
      output += `           SUMMARY: ${summary.replace(/\n/g, '\n           ')}\n`
      output += `           ${'─'.repeat(60)}\n`
    }
    if (logPath) {
      output += `           📄 Full output: ${logPath}\n`
    }
    return output + '\n'
  }

  private formatRalph(time: string, iteration: number): string {
    return `[${time}] ↻ RALPH: Iteration ${iteration} complete\n           Triggering remount...\n\n`
  }

  private formatError(time: string, message: string, logPath?: string): string {
    let output = `[${time}] ✗ ERROR: ${message}\n`
    if (logPath) {
      output += `           📄 Full error: ${logPath}\n`
    }
    return output + '\n'
  }

  private formatLog(message: string): string {
    // Don't show timestamp for regular logs to reduce noise
    return `           ${message}\n`
  }

  formatSummary(duration: number, logDir: string): string {
    const lines = [
      '',
      '╔══════════════════════════════════════════════════════════════════╗',
      '║                         EXECUTION SUMMARY                        ║',
      '╠══════════════════════════════════════════════════════════════════╣',
      `║  Duration: ${this.formatDuration(duration).padEnd(56)} ║`,
      `║  Phases completed: ${String(this.stats.phasesCompleted).padEnd(47)} ║`,
      `║  Agents executed: ${String(this.stats.agentsExecuted).padEnd(48)} ║`,
      `║  Tool calls: ${String(this.stats.toolCalls).padEnd(53)} ║`,
      `║  Errors: ${String(this.stats.errors).padEnd(57)} ║`,
      `║  Log directory: ${logDir.padEnd(50)} ║`,
      '╚══════════════════════════════════════════════════════════════════╝',
      '',
    ]
    return lines.join('\n')
  }

  private formatTime(date: Date): string {
    return date.toTimeString().substring(0, 8)
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    if (maxLength <= 3) return text.substring(0, maxLength)
    return text.substring(0, maxLength - 3) + '...'
  }

  getStats(): FormatterStats {
    return { ...this.stats }
  }
}
