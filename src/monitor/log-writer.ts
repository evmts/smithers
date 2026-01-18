import * as fs from 'fs'
import * as path from 'path'

export class LogWriter {
  private logDir: string
  private counter: number = 0
  private sessionId: string
  private streams: Map<string, fs.WriteStream> = new Map()

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
   * Append content to a log file using a persistent WriteStream for efficiency.
   * Creates the file if it doesn't exist.
   * Returns the full path to the log file.
   */
  appendLog(filename: string, content: string): string {
    const filepath = path.join(this.logDir, filename)
    
    // Get or create a WriteStream for this file
    let stream = this.streams.get(filename)
    if (!stream || stream.destroyed || stream.writableEnded) {
      if (stream) {
        this.streams.delete(filename)
      }
      stream = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf-8' })
      this.streams.set(filename, stream)
    }

    if (stream.fd === null) {
      fs.appendFileSync(filepath, content, 'utf-8')
    } else if (!stream.writableEnded && !stream.destroyed) {
      stream.write(content)
    }
    return filepath
  }

  /**
   * Close a specific log stream. Call when done writing to a log file.
   */
  closeStream(filename: string): void {
    const stream = this.streams.get(filename)
    if (stream) {
      stream.end()
      this.streams.delete(filename)
    }
  }

  /**
   * Close all open streams. Call when done with the LogWriter.
   */
  closeAllStreams(): void {
    for (const [filename, stream] of this.streams) {
      stream.end()
      this.streams.delete(filename)
    }
  }

  /**
   * Flush and close all open streams, waiting for writes to complete.
   * Use this before process exit to ensure no logs are lost.
   */
  flushAllStreams(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const [filename, stream] of this.streams) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          stream.once('finish', resolve)
          stream.once('error', reject)
          stream.end()
        })
      )
      this.streams.delete(filename)
    }
    return Promise.all(promises).then(() => {})
  }

  /**
   * Flush and close a specific stream, waiting for writes to complete.
   */
  flushStream(filename: string): Promise<void> {
    const stream = this.streams.get(filename)
    if (!stream) {
      return Promise.resolve()
    }
    this.streams.delete(filename)
    return new Promise<void>((resolve, reject) => {
      stream.once('finish', resolve)
      stream.once('error', reject)
      stream.end()
    })
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
