import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { LogWriter } from './log-writer.js'

const TEST_LOG_DIR = '.smithers/test-logs'

describe('LogWriter', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true })
    }
    const executionsDir = path.resolve('.smithers/executions')
    if (fs.existsSync(executionsDir)) {
      fs.rmSync(executionsDir, { recursive: true, force: true })
    }
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

    // Close the stream to flush content to disk
    writer.closeStream(filename)

    // Wait a bit for file system operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(fs.existsSync(path1)).toBe(true)
    const content = fs.readFileSync(path1, 'utf-8')
    expect(content).toBe('chunk 1\nchunk 2\n')
  })
})
