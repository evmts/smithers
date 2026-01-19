import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { LogWriter } from './log-writer.js'

let testRootDir: string
let testLogDir: string
let testExecutionRoot: string

describe('LogWriter', () => {
  beforeEach(() => {
    testRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithers-logwriter-'))
    testLogDir = path.join(testRootDir, 'logs')
    testExecutionRoot = path.join(testRootDir, 'executions')
  })

  afterEach(() => {
    fs.rmSync(testRootDir, { recursive: true, force: true })
  })

  it('should create log directory if it does not exist', () => {
    new LogWriter(testLogDir)
    expect(fs.existsSync(testLogDir)).toBe(true)
  })

  it('should use execution directory if executionId is provided', () => {
    const executionId = 'test-execution-id'
    const writer = new LogWriter(testLogDir, executionId, testExecutionRoot)
    // The path resolution logic in LogWriter:
    // if (executionId) {
    //   this.logDir = path.resolve(executionBaseDir, executionId, 'logs')
    // }
    const expectedDir = path.resolve(testExecutionRoot, executionId, 'logs')
    expect(writer.getLogDir()).toBe(expectedDir)
  })

  it('should sanitize executionId to prevent traversal', () => {
    const writer = new LogWriter(testLogDir, '../evil', testExecutionRoot)
    const logDir = writer.getLogDir()
    const root = path.resolve(testExecutionRoot)
    expect(logDir.startsWith(root + path.sep)).toBe(true)
  })

  it('should write log file with metadata', () => {
    const writer = new LogWriter(testLogDir)
    const content = 'test content'
    const metadata = { key: 'value' }
    
    const filepath = writer.writeLog('test', content, metadata)
    
    expect(fs.existsSync(filepath)).toBe(true)
    const fileContent = fs.readFileSync(filepath, 'utf-8')
    expect(fileContent).toContain('METADATA')
    expect(fileContent).toContain('key: value')
    expect(fileContent).toContain('CONTENT')
    expect(fileContent).toContain('test content')
  })

  it('should append to log file', async () => {
    const writer = new LogWriter(testLogDir)
    const filename = 'append-test.log'

    const path1 = writer.appendLog(filename, 'chunk 1\n')
    writer.appendLog(filename, 'chunk 2\n')

    await writer.flushStream(filename)

    expect(fs.existsSync(path1)).toBe(true)
    const content = fs.readFileSync(path1, 'utf-8')
    expect(content).toBe('chunk 1\nchunk 2\n')
  })

  it('should sanitize filenames to prevent traversal', async () => {
    const writer = new LogWriter(testLogDir)
    const path1 = writer.appendLog('../evil.log', 'data\n')

    await writer.flushStream('../evil.log')

    const relative = path.relative(testLogDir, path1)
    expect(relative.startsWith('..')).toBe(false)
    expect(path.isAbsolute(relative)).toBe(false)
    expect(fs.readFileSync(path1, 'utf-8')).toContain('data')
  })

  it('should flush multiple streams', async () => {
    const writer = new LogWriter(testLogDir)

    writer.appendLog('first.log', 'first\n')
    writer.appendLog('second.log', 'second\n')

    await writer.flushAllStreams()

    const firstPath = path.join(testLogDir, 'first.log')
    const secondPath = path.join(testLogDir, 'second.log')

    expect(fs.readFileSync(firstPath, 'utf-8')).toBe('first\n')
    expect(fs.readFileSync(secondPath, 'utf-8')).toBe('second\n')
  })

  it('should append stream parts as ndjson', async () => {
    const writer = new LogWriter(testLogDir)
    const filename = 'stream-test.ndjson'

    writer.appendStreamPart(filename, { type: 'text-start', id: 't1' })
    writer.appendStreamPart(filename, { type: 'text-delta', id: 't1', delta: 'Hello' })

    await writer.flushStream(filename)

    const content = fs.readFileSync(path.join(testLogDir, filename), 'utf-8').trim()
    const lines = content.split('\n').map((line) => JSON.parse(line))

    expect(lines[0]).toMatchObject({ type: 'text-start', id: 't1' })
    expect(lines[1]).toMatchObject({ type: 'text-delta', id: 't1', delta: 'Hello' })
  })

  it('should reopen stream for appendStreamPart after flush', async () => {
    const writer = new LogWriter(testLogDir)
    const filename = 'stream-reopen.ndjson'

    writer.appendStreamPart(filename, { type: 'text-start', id: 't1' })
    await writer.flushStream(filename)

    writer.appendStreamPart(filename, { type: 'text-end', id: 't1' })
    await writer.flushStream(filename)

    const content = fs.readFileSync(path.join(testLogDir, filename), 'utf-8').trim()
    const lines = content.split('\n').map((line) => JSON.parse(line))
    expect(lines).toHaveLength(2)
  })

  it('should write stream summary from counts', () => {
    const writer = new LogWriter(testLogDir)
    const filename = 'summary-test.ndjson'
    const summaryPath = writer.writeStreamSummaryFromCounts(filename, {
      textBlocks: 1,
      reasoningBlocks: 2,
      toolCalls: 3,
      toolResults: 4,
      errors: 5,
    })

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
    expect(summary).toEqual({
      textBlocks: 1,
      reasoningBlocks: 2,
      toolCalls: 3,
      toolResults: 4,
      errors: 5,
    })
  })

  it('should write stream summary from parts array', async () => {
    const writer = new LogWriter(testLogDir)
    const filename = 'parts-summary.ndjson'
    const parts = [
      { type: 'text-end' as const, id: 't1' },
      { type: 'text-end' as const, id: 't2' },
      { type: 'reasoning-end' as const, id: 'r1' },
      { type: 'tool-call' as const, id: 'tc1', name: 'Read', input: {} },
      { type: 'tool-result' as const, id: 'tr1', result: 'ok' },
      { type: 'error' as const, id: 'e1', message: 'err' },
    ]

    const summaryPath = writer.writeStreamSummary(filename, parts as any)

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
    expect(summary).toEqual({
      textBlocks: 2,
      reasoningBlocks: 1,
      toolCalls: 1,
      toolResults: 1,
      errors: 1,
    })
  })

  it('should write tool call log', () => {
    const writer = new LogWriter(testLogDir)
    const filepath = writer.writeToolCall('Read', { path: '/test' }, 'file contents here')

    expect(fs.existsSync(filepath)).toBe(true)
    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('tool: Read')
    expect(content).toContain('/test')
    expect(content).toContain('file contents here')
  })

  it('should handle circular tool input', () => {
    const writer = new LogWriter(testLogDir)
    const input: any = { path: '/test' }
    input.self = input
    const filepath = writer.writeToolCall('Read', input, 'file contents here')

    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('Circular')
  })

  it('should write agent result log', () => {
    const writer = new LogWriter(testLogDir)
    const filepath = writer.writeAgentResult('MainAgent', 'Task completed successfully')

    expect(fs.existsSync(filepath)).toBe(true)
    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('agent: MainAgent')
    expect(content).toContain('Task completed successfully')
  })

  it('should write error log from Error object', () => {
    const writer = new LogWriter(testLogDir)
    const error = new Error('Something went wrong')
    const filepath = writer.writeError(error)

    expect(fs.existsSync(filepath)).toBe(true)
    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('Something went wrong')
  })

  it('should write error log from string', () => {
    const writer = new LogWriter(testLogDir)
    const filepath = writer.writeError('String error message')

    expect(fs.existsSync(filepath)).toBe(true)
    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('String error message')
  })

  it('should close specific stream', async () => {
    const writer = new LogWriter(testLogDir)
    const filename = 'close-test.log'

    writer.appendLog(filename, 'content\n')
    await writer.closeStream(filename)

    // Closing again should not throw
    await writer.closeStream(filename)

    const filepath = path.join(testLogDir, filename)
    expect(fs.existsSync(filepath)).toBe(true)
  })

  it('should return session id', () => {
    const writer = new LogWriter(testLogDir)
    const sessionId = writer.getSessionId()

    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
    // Session ID format: ISO date with colons and dots replaced by dashes
    expect(sessionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)
  })

  it('should close all streams', async () => {
    const writer = new LogWriter(testLogDir)

    writer.appendLog('stream1.log', 'content1\n')
    writer.appendLog('stream2.log', 'content2\n')

    await writer.closeAllStreams()

    expect(fs.existsSync(path.join(testLogDir, 'stream1.log'))).toBe(true)
    expect(fs.existsSync(path.join(testLogDir, 'stream2.log'))).toBe(true)
  })

  it('should handle appendLog when stream is not writable', async () => {
    const writer = new LogWriter(testLogDir)
    const filename = 'append-fallback.log'

    // Write first chunk
    writer.appendLog(filename, 'chunk1\n')
    
    // Close the stream
    await writer.flushStream(filename)

    // Try to append again - should use sync fallback
    writer.appendLog(filename, 'chunk2\n')
    await writer.flushStream(filename)

    const content = fs.readFileSync(path.join(testLogDir, filename), 'utf-8')
    expect(content).toContain('chunk1')
    expect(content).toContain('chunk2')
  })
})
