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
})
