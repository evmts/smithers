import * as fs from 'fs'
import * as path from 'path'
import type { SmithersStreamPart } from '../streaming/types.js'
import type { StreamSummary } from '../db/types.js'

export class LogWriter {
  private logDir: string
  private counter: number = 0
  private sessionId: string
  private streams: Map<string, fs.WriteStream> = new Map()
  private pending: Map<string, string[]> = new Map()

  constructor(logDir: string = '.smithers/logs', executionId?: string, executionBaseDir?: string) {
    if (executionId) {
      const safeExecutionId = this.sanitizeSegment(executionId, 'execution')
      const baseDir = executionBaseDir ?? '.smithers/executions'
      this.logDir = path.resolve(baseDir, safeExecutionId, 'logs')
    } else {
      this.logDir = path.resolve(logDir)
    }
    this.sessionId = this.sanitizeSegment(new Date().toISOString().replace(/[:.]/g, '-'), 'session')

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  writeLog(type: string, content: string, metadata?: Record<string, any>): string {
    this.counter++
    const safeType = this.sanitizeSegment(type, 'log')
    const filename = `${this.sessionId}-${String(this.counter).padStart(3, '0')}-${safeType}.txt`
    const { filepath } = this.resolveSafePath(filename, 'log.txt')

    // Add metadata header
    let output = ''
    if (metadata) {
      output += '='.repeat(60) + '\n'
      output += 'METADATA\n'
      output += '='.repeat(60) + '\n'
      for (const [key, value] of Object.entries(metadata)) {
        output += `${key}: ${this.formatMetadataValue(value)}\n`
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
    const { filename: safeFilename, filepath } = this.resolveSafePath(filename, 'log.txt')
    
    // Get or create a WriteStream for this file
    let stream = this.streams.get(safeFilename)
    if (!stream || stream.destroyed || stream.writableEnded) {
      if (stream) {
        this.streams.delete(safeFilename)
      }
      stream = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf-8' })
      this.attachStreamHandlers(safeFilename, stream)
      this.streams.set(safeFilename, stream)
    }

    this.writeToStream(safeFilename, filepath, stream, content)
    return filepath
  }

  /**
   * Append a typed stream part as NDJSON.
   */
  appendStreamPart(filename: string, part: SmithersStreamPart): string {
    const { filename: safeFilename, filepath } = this.resolveSafePath(filename, 'stream.ndjson')

    let stream = this.streams.get(safeFilename)
    if (!stream || stream.destroyed || stream.writableEnded) {
      if (stream) {
        this.streams.delete(safeFilename)
      }
      stream = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf-8' })
      this.attachStreamHandlers(safeFilename, stream)
      this.streams.set(safeFilename, stream)
    }

    const line = JSON.stringify({ timestamp: Date.now(), ...part }) + '\n'
    this.writeToStream(safeFilename, filepath, stream, line)
    return filepath
  }

  /**
   * Write a summary file for stream events.
   */
  writeStreamSummary(filename: string, parts: SmithersStreamPart[]): string {
    const { filepath } = this.resolveSafePath(filename, 'summary.ndjson')
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
    const { filepath } = this.resolveSafePath(filename, 'summary.ndjson')
    const summaryPath = filepath.replace(/\.log$|\.ndjson$/, '') + '.summary.json'
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
    return summaryPath
  }

  /**
   * Close a specific log stream, waiting for writes to complete.
   */
  closeStream(filename: string): Promise<void> {
    return this.flushStream(filename)
  }

  /**
   * Close all open streams, waiting for writes to complete.
   */
  closeAllStreams(): Promise<void> {
    return this.flushAllStreams()
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
      this.pending.delete(filename)
    }
    return Promise.all(promises).then(() => {})
  }

  /**
   * Flush and close a specific stream, waiting for writes to complete.
   */
  flushStream(filename: string): Promise<void> {
    const { filename: safeFilename } = this.resolveSafePath(filename, 'log.txt')
    const stream = this.streams.get(safeFilename)
    if (!stream) {
      return Promise.resolve()
    }
    this.streams.delete(safeFilename)
    this.pending.delete(safeFilename)
    return new Promise<void>((resolve, reject) => {
      stream.once('finish', resolve)
      stream.once('error', reject)
      stream.end()
    })
  }

  writeToolCall(toolName: string, input: any, output: string): string {
    const metadata = {
      tool: toolName,
      input: this.safeJsonStringify(input),
      timestamp: new Date().toISOString(),
    }
    const safeToolName = this.sanitizeSegment(toolName.toLowerCase(), 'tool')
    return this.writeLog(`tool-${safeToolName}`, output, metadata)
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

  private sanitizeSegment(value: string, fallback: string): string {
    const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.\.+/g, '_')
    const trimmed = cleaned.replace(/^_+|_+$/g, '')
    return trimmed.length > 0 ? trimmed : fallback
  }

  private sanitizeFilename(value: string, fallback: string): string {
    const base = path.basename(value)
    return this.sanitizeSegment(base, fallback)
  }

  private resolveSafePath(filename: string, fallback: string): { filename: string; filepath: string } {
    const safeFilename = this.sanitizeFilename(filename, fallback)
    const filepath = path.resolve(this.logDir, safeFilename)
    const logRoot = this.logDir.endsWith(path.sep) ? this.logDir : this.logDir + path.sep
    if (!filepath.startsWith(logRoot) && filepath !== this.logDir) {
      const fallbackName = this.sanitizeFilename(fallback, 'log')
      return { filename: fallbackName, filepath: path.resolve(this.logDir, fallbackName) }
    }
    return { filename: safeFilename, filepath }
  }

  private attachStreamHandlers(filename: string, stream: fs.WriteStream): void {
    stream.on('error', (err) => {
      if (this.streams.get(filename) === stream) {
        this.streams.delete(filename)
      }
      this.pending.delete(filename)
      console.warn(
        `[log-writer] Stream error for ${filename}: ${err instanceof Error ? err.message : String(err)}`
      )
    })
    stream.on('close', () => {
      if (this.streams.get(filename) === stream) {
        this.streams.delete(filename)
      }
      this.pending.delete(filename)
    })
  }

  private enqueue(filename: string, content: string) {
    const q = this.pending.get(filename) ?? []
    q.push(content)
    this.pending.set(filename, q)
  }

  private flushQueue(filename: string, stream: fs.WriteStream) {
    const q = this.pending.get(filename)
    if (!q || q.length === 0) {
      this.pending.delete(filename)
      return
    }

    while (q.length > 0) {
      const next = q.shift()!
      const ok = stream.write(next)
      if (!ok) {
        stream.once('drain', () => this.flushQueue(filename, stream))
        return
      }
    }
    this.pending.delete(filename)
  }

  private writeToStream(filename: string, filepath: string, stream: fs.WriteStream, content: string): void {
    if (!stream.writable || stream.writableEnded || stream.destroyed) {
      fs.appendFileSync(filepath, content, 'utf-8')
      return
    }

    if (this.pending.has(filename)) {
      this.enqueue(filename, content)
      return
    }

    const ok = stream.write(content)
    if (!ok) {
      this.pending.set(filename, [])
      stream.once('drain', () => this.flushQueue(filename, stream))
    }
  }

  private formatMetadataValue(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
      return String(value)
    }
    return this.safeJsonStringify(value)
  }

  private safeJsonStringify(value: unknown): string {
    try {
      const seen = new WeakSet<object>()
      return JSON.stringify(
        value,
        (key, val) => {
          void key
          if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) return '[Circular]'
            seen.add(val)
          }
          if (typeof val === 'bigint') return val.toString()
          return val
        },
        2
      )
    } catch (err) {
      return `[Unserializable: ${err instanceof Error ? err.message : String(err)}]`
    }
  }
}
