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

    await writer.flushStream(filename)

    expect(fs.existsSync(path1)).toBe(true)
    const content = fs.readFileSync(path1, 'utf-8')
    expect(content).toBe('chunk 1\nchunk 2\n')
  })

  describe('writeLog edge cases', () => {
    it('writeLog without metadata writes content only', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const content = 'test content without metadata'
      
      const filepath = writer.writeLog('test', content)
      
      expect(fs.existsSync(filepath)).toBe(true)
      const fileContent = fs.readFileSync(filepath, 'utf-8')
      expect(fileContent).toBe(content)
      expect(fileContent).not.toContain('METADATA')
    })

    it('writeLog with empty content creates file', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const filepath = writer.writeLog('empty', '')
      
      expect(fs.existsSync(filepath)).toBe(true)
      const fileContent = fs.readFileSync(filepath, 'utf-8')
      expect(fileContent).toBe('')
    })

    it('writeLog with binary content handles encoding', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]).toString('utf-8')
      
      const filepath = writer.writeLog('binary', binaryContent)
      
      expect(fs.existsSync(filepath)).toBe(true)
    })

    it('writeLog with very large content (>10MB)', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const largeContent = 'x'.repeat(11 * 1024 * 1024)
      
      const filepath = writer.writeLog('large', largeContent)
      
      expect(fs.existsSync(filepath)).toBe(true)
      const stats = fs.statSync(filepath)
      expect(stats.size).toBeGreaterThan(10 * 1024 * 1024)
    })

    it('writeLog counter increments correctly across multiple calls', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const path1 = writer.writeLog('test', 'content1')
      const path2 = writer.writeLog('test', 'content2')
      const path3 = writer.writeLog('test', 'content3')
      
      expect(path1).toContain('-001-')
      expect(path2).toContain('-002-')
      expect(path3).toContain('-003-')
    })
  })

  describe('appendLog edge cases', () => {
    it('appendLog creates new file if it does not exist', async () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const filename = 'new-file.log'
      
      const filepath = writer.appendLog(filename, 'initial content')
      await writer.flushStream(filename)
      
      expect(fs.existsSync(filepath)).toBe(true)
    })

    it('appendLog handles empty content', async () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const filename = 'empty-append.log'
      
      writer.appendLog(filename, '')
      await writer.flushStream(filename)
      
      const filepath = path.join(writer.getLogDir(), filename)
      expect(fs.existsSync(filepath)).toBe(true)
    })

    it('appendLog handles concurrent appends to same file', async () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const filename = 'concurrent.log'
      
      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(writer.appendLog(filename, `line ${i}\n`)))
      }
      
      await Promise.all(promises)
      await writer.flushStream(filename)
      
      const filepath = path.join(writer.getLogDir(), filename)
      const content = fs.readFileSync(filepath, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines.length).toBe(100)
    })
  })

  describe('stream management', () => {
    it('closeStream handles non-existent stream gracefully', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      expect(() => writer.closeStream('nonexistent.log')).not.toThrow()
    })

    it('closeAllStreams closes all open streams', async () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      writer.appendLog('file1.log', 'content1')
      writer.appendLog('file2.log', 'content2')
      writer.appendLog('file3.log', 'content3')
      
      writer.closeAllStreams()
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(fs.existsSync(path.join(writer.getLogDir(), 'file1.log'))).toBe(true)
      expect(fs.existsSync(path.join(writer.getLogDir(), 'file2.log'))).toBe(true)
      expect(fs.existsSync(path.join(writer.getLogDir(), 'file3.log'))).toBe(true)
    })

    it('flushAllStreams waits for all writes to complete', async () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      for (let i = 0; i < 10; i++) {
        writer.appendLog(`flush-test-${i}.log`, `content ${i}`)
      }
      
      await writer.flushAllStreams()
      
      for (let i = 0; i < 10; i++) {
        const filepath = path.join(writer.getLogDir(), `flush-test-${i}.log`)
        expect(fs.existsSync(filepath)).toBe(true)
        const content = fs.readFileSync(filepath, 'utf-8')
        expect(content).toBe(`content ${i}`)
      }
    })

    it('flushStream handles non-existent stream', async () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      await expect(writer.flushStream('nonexistent.log')).resolves.toBeUndefined()
    })
  })

  describe('writeToolCall', () => {
    it('writeToolCall formats tool name correctly', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const filepath = writer.writeToolCall('ReadFile', { path: '/test' }, 'output')
      
      expect(filepath).toContain('tool-readfile')
      const content = fs.readFileSync(filepath, 'utf-8')
      expect(content).toContain('tool: ReadFile')
    })

    it('writeToolCall serializes complex input objects', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const complexInput = {
        nested: { key: 'value' },
        array: [1, 2, 3],
        null: null,
      }
      
      const filepath = writer.writeToolCall('Test', complexInput, 'output')
      
      const content = fs.readFileSync(filepath, 'utf-8')
      expect(content).toContain('"nested"')
      expect(content).toContain('"array"')
    })

    it('writeToolCall handles null/undefined input', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const filepath1 = writer.writeToolCall('Test', null, 'output')
      const filepath2 = writer.writeToolCall('Test', undefined, 'output')
      
      expect(fs.existsSync(filepath1)).toBe(true)
      expect(fs.existsSync(filepath2)).toBe(true)
    })
  })

  describe('writeAgentResult', () => {
    it('writeAgentResult creates file with correct format', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const filepath = writer.writeAgentResult('TestAgent', 'agent result')
      
      expect(fs.existsSync(filepath)).toBe(true)
      const content = fs.readFileSync(filepath, 'utf-8')
      expect(content).toContain('agent: TestAgent')
      expect(content).toContain('agent result')
    })

    it('writeAgentResult handles empty result', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const filepath = writer.writeAgentResult('TestAgent', '')
      
      expect(fs.existsSync(filepath)).toBe(true)
    })
  })

  describe('writeError', () => {
    it('writeError handles Error object with stack', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const error = new Error('Test error')
      
      const filepath = writer.writeError(error)
      
      const content = fs.readFileSync(filepath, 'utf-8')
      expect(content).toContain('Test error')
      expect(content).toContain('at ')
    })

    it('writeError handles Error object without stack', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const error = new Error('Test error')
      error.stack = undefined
      
      const filepath = writer.writeError(error)
      
      const content = fs.readFileSync(filepath, 'utf-8')
      expect(content).toContain('Test error')
    })

    it('writeError handles string error', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const filepath = writer.writeError('String error message')
      
      const content = fs.readFileSync(filepath, 'utf-8')
      expect(content).toContain('String error message')
    })

    it('writeError handles empty string error', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const filepath = writer.writeError('')
      
      expect(fs.existsSync(filepath)).toBe(true)
    })
  })

  describe('sessionId and logDir', () => {
    it('getSessionId returns consistent value', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      
      const sessionId1 = writer.getSessionId()
      const sessionId2 = writer.getSessionId()
      
      expect(sessionId1).toBe(sessionId2)
    })

    it('sessionId format is valid for filenames', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const sessionId = writer.getSessionId()
      
      expect(sessionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/)
    })

    it('getLogDir returns absolute path', () => {
      const writer = new LogWriter(TEST_LOG_DIR)
      const logDir = writer.getLogDir()
      
      expect(path.isAbsolute(logDir)).toBe(true)
    })

    it('multiple LogWriter instances have unique sessionIds', async () => {
      const writer1 = new LogWriter(TEST_LOG_DIR)
      await new Promise(resolve => setTimeout(resolve, 2))
      const writer2 = new LogWriter(TEST_LOG_DIR)
      
      expect(writer1.getSessionId()).not.toBe(writer2.getSessionId())
    })
  })
})
