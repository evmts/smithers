import * as fs from 'fs'
import * as path from 'path'

export class LogWriter {
  private logDir: string
  private counter: number = 0
  private sessionId: string

  constructor(logDir: string = '.smithers/logs', executionId?: string) {
    if (executionId) {
      this.logDir = path.resolve('.smithers/executions', executionId, 'logs')
    } else {
      this.logDir = path.resolve(logDir)
    }
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-')

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  writeLog(type: string, content: string, metadata?: Record<string, any>): string {
    this.counter++
    const filename = `${this.sessionId}-${String(this.counter).padStart(3, '0')}-${type}.txt`
    const filepath = path.join(this.logDir, filename)

    // Add metadata header
    let output = ''
    if (metadata) {
      output += '='.repeat(60) + '\n'
      output += 'METADATA\n'
      output += '='.repeat(60) + '\n'
      for (const [key, value] of Object.entries(metadata)) {
        output += `${key}: ${value}\n`
      }
      output += '\n'
      output += '='.repeat(60) + '\n'
      output += 'CONTENT\n'
      output += '='.repeat(60) + '\n'
    }

    output += content

    fs.writeFileSync(filepath, output, 'utf-8')

    return filepath
  }

  /**
   * Append content to a log file. Creates the file if it doesn't exist.
   * Returns the full path to the log file.
   */
  appendLog(filename: string, content: string): string {
    const filepath = path.join(this.logDir, filename)
    fs.appendFileSync(filepath, content, 'utf-8')
    return filepath
  }

  writeToolCall(toolName: string, input: any, output: string): string {
    const metadata = {
      tool: toolName,
      input: JSON.stringify(input, null, 2),
      timestamp: new Date().toISOString(),
    }
    return this.writeLog(`tool-${toolName.toLowerCase()}`, output, metadata)
  }

  writeAgentResult(agentName: string, result: string): string {
    const metadata = {
      agent: agentName,
      timestamp: new Date().toISOString(),
    }
    return this.writeLog('agent-result', result, metadata)
  }

  writeError(error: Error | string): string {
    const content = error instanceof Error ? error.stack || error.message : error
    const metadata = {
      timestamp: new Date().toISOString(),
    }
    return this.writeLog('error', content, metadata)
  }

  getLogDir(): string {
    return this.logDir
  }

  getSessionId(): string {
    return this.sessionId
  }
}
