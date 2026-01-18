import * as fs from 'fs'
import * as path from 'path'
import type { SmithersStreamPart } from '../streaming/types.js'
import type { StreamSummary } from '../db/types.js'

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

    if (!stream.writable) {
      fs.appendFileSync(filepath, content, 'utf-8')
    } else if (!stream.writableEnded && !stream.destroyed) {
      stream.write(content)
    }
    return filepath
  }

  /**
   * Append a typed stream part as NDJSON.
   */
  appendStreamPart(filename: string, part: SmithersStreamPart): string {
    const filepath = path.join(this.logDir, filename)

    let stream = this.streams.get(filename)
    if (!stream) {
      stream = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf-8' })
      this.streams.set(filename, stream)
    }

    const line = JSON.stringify({ timestamp: Date.now(), ...part }) + '\n'
    stream.write(line)
    return filepath
  }

  /**
   * Write a summary file for stream events.
   */
  writeStreamSummary(filename: string, parts: SmithersStreamPart[]): string {
    const filepath = path.join(this.logDir, filename)
    const summaryPath = filepath.replace(/\.log$|\.ndjson$/, '') + '.summary.json'
    const summary = {
      textBlocks: parts.filter((part) => part.type === 'text-end').length,
      reasoningBlocks: parts.filter((part) => part.type === 'reasoning-end').length,
      toolCalls: parts.filter((part) => part.type === 'tool-call').length,
      toolResults: parts.filter((part) => part.type === 'tool-result').length,
      errors: parts.filter((part) => part.type === 'error').length,
    }

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
    return summaryPath
  }

  /**
   * Write a summary file from precomputed counts.
   */
  writeStreamSummaryFromCounts(filename: string, summary: StreamSummary): string {
    const filepath = path.join(this.logDir, filename)
    const summaryPath = filepath.replace(/\.log$|\.ndjson$/, '') + '.summary.json'
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
    return summaryPath
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
