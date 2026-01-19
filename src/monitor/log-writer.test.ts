import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { LogWriter } from './log-writer.js'

const TEST_LOG_DIR = path.join(os.tmpdir(), 'smithers-test-logs-' + process.pid)
const TEST_EXECUTIONS_DIR = path.join(os.tmpdir(), 'smithers-test-executions-' + process.pid)

function cleanupDirs() {
  if (fs.existsSync(TEST_LOG_DIR)) {
    fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true })
  }
  if (fs.existsSync(TEST_EXECUTIONS_DIR)) {
    fs.rmSync(TEST_EXECUTIONS_DIR, { recursive: true, force: true })
  }
  const executionsDir = path.resolve('.smithers/executions')
  if (fs.existsSync(executionsDir)) {
    fs.rmSync(executionsDir, { recursive: true, force: true })
  }
}

describe('LogWriter', () => {
  beforeEach(() => {
    cleanupDirs()
  })

  afterEach(() => {
    cleanupDirs()
  })

  it('should create log directory if it does not exist', () => {
    new LogWriter(TEST_LOG_DIR)
    expect(fs.existsSync(TEST_LOG_DIR)).toBe(true)
  })

  it('should use execution directory if executionId is provided', () => {
    const executionId = 'test-execution-id'
    const writer = new LogWriter(TEST_LOG_DIR, executionId)
    // The path resolution logic in LogWriter:
    // if (executionId) {
    //   this.logDir = path.resolve('.smithers/executions', executionId, 'logs')
    // }
    const expectedDir = path.resolve('.smithers/executions', executionId, 'logs')
    expect(writer.getLogDir()).toBe(expectedDir)
    
    // Clean up the execution dir created
    if (fs.existsSync(expectedDir)) {
      fs.rmSync(path.resolve('.smithers/executions'), { recursive: true, force: true })
    }
  })

  it('should write log file with metadata', () => {
    const writer = new LogWriter(TEST_LOG_DIR)
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
    const writer = new LogWriter(TEST_LOG_DIR)
    const filename = 'append-test.log'

    const path1 = writer.appendLog(filename, 'chunk 1\n')
    writer.appendLog(filename, 'chunk 2\n')

    await writer.flushStream(filename)

    expect(fs.existsSync(path1)).toBe(true)
    const content = fs.readFileSync(path1, 'utf-8')
    expect(content).toBe('chunk 1\nchunk 2\n')
  })

  it('should flush multiple streams', async () => {
    const writer = new LogWriter(TEST_LOG_DIR)

    writer.appendLog('first.log', 'first\n')
    writer.appendLog('second.log', 'second\n')

    await writer.flushAllStreams()

    const firstPath = path.join(TEST_LOG_DIR, 'first.log')
    const secondPath = path.join(TEST_LOG_DIR, 'second.log')

    expect(fs.readFileSync(firstPath, 'utf-8')).toBe('first\n')
    expect(fs.readFileSync(secondPath, 'utf-8')).toBe('second\n')
  })

  it('should append stream parts as ndjson', async () => {
    const writer = new LogWriter(TEST_LOG_DIR)
    const filename = 'stream-test.ndjson'

    writer.appendStreamPart(filename, { type: 'text-start', id: 't1' })
    writer.appendStreamPart(filename, { type: 'text-delta', id: 't1', delta: 'Hello' })

    await writer.flushStream(filename)

    const content = fs.readFileSync(path.join(TEST_LOG_DIR, filename), 'utf-8').trim()
    const lines = content.split('\n').map((line) => JSON.parse(line))

    expect(lines[0]).toMatchObject({ type: 'text-start', id: 't1' })
    expect(lines[1]).toMatchObject({ type: 'text-delta', id: 't1', delta: 'Hello' })
  })

  it('should write stream summary from counts', () => {
    const writer = new LogWriter(TEST_LOG_DIR)
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
    const writer = new LogWriter(TEST_LOG_DIR)
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
    const writer = new LogWriter(TEST_LOG_DIR)
    const filepath = writer.writeToolCall('Read', { path: '/test' }, 'file contents here')

    expect(fs.existsSync(filepath)).toBe(true)
    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('tool: Read')
    expect(content).toContain('/test')
    expect(content).toContain('file contents here')
  })

  it('should write agent result log', () => {
    const writer = new LogWriter(TEST_LOG_DIR)
    const filepath = writer.writeAgentResult('MainAgent', 'Task completed successfully')

    expect(fs.existsSync(filepath)).toBe(true)
    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('agent: MainAgent')
    expect(content).toContain('Task completed successfully')
  })

  it('should write error log from Error object', () => {
    const writer = new LogWriter(TEST_LOG_DIR)
    const error = new Error('Something went wrong')
    const filepath = writer.writeError(error)

    expect(fs.existsSync(filepath)).toBe(true)
    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('Something went wrong')
  })

  it('should write error log from string', () => {
    const writer = new LogWriter(TEST_LOG_DIR)
    const filepath = writer.writeError('String error message')

    expect(fs.existsSync(filepath)).toBe(true)
    const content = fs.readFileSync(filepath, 'utf-8')
    expect(content).toContain('String error message')
  })

  it('should close specific stream', async () => {
    const writer = new LogWriter(TEST_LOG_DIR)
    const filename = 'close-test.log'

    writer.appendLog(filename, 'content\n')
    writer.closeStream(filename)

    // Closing again should not throw
    writer.closeStream(filename)

    const filepath = path.join(TEST_LOG_DIR, filename)
    // Wait for stream to finish
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fs.existsSync(filepath)).toBe(true)
  })

  it('should return session id', () => {
    const writer = new LogWriter(TEST_LOG_DIR)
    const sessionId = writer.getSessionId()

    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
    // Session ID format: ISO date with colons and dots replaced by dashes
    expect(sessionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)
  })

  it('should close all streams', async () => {
    const writer = new LogWriter(TEST_LOG_DIR)

    writer.appendLog('stream1.log', 'content1\n')
    writer.appendLog('stream2.log', 'content2\n')

    writer.closeAllStreams()

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(fs.existsSync(path.join(TEST_LOG_DIR, 'stream1.log'))).toBe(true)
    expect(fs.existsSync(path.join(TEST_LOG_DIR, 'stream2.log'))).toBe(true)
  })

  it('should handle appendLog when stream is not writable', async () => {
    const writer = new LogWriter(TEST_LOG_DIR)
    const filename = 'append-fallback.log'

    // Write first chunk
    writer.appendLog(filename, 'chunk1\n')
    
    // Close the stream
    await writer.flushStream(filename)

    // Try to append again - should use sync fallback
    writer.appendLog(filename, 'chunk2\n')
    
    await new Promise((resolve) => setTimeout(resolve, 50))

    const content = fs.readFileSync(path.join(TEST_LOG_DIR, filename), 'utf-8')
    expect(content).toContain('chunk1')
    expect(content).toContain('chunk2')
  })
})
