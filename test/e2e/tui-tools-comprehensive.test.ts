/**
 * Comprehensive TUI Tool E2E Tests
 * 
 * Tests all agent tools through the CLI mode with real AI responses.
 * No mocking - tests the full stack from binary to Anthropic API.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

function findProjectRoot(): string {
  let dir = import.meta.dir
  while (dir !== '/') {
    if (existsSync(path.join(dir, 'package.json'))) return dir
    dir = path.dirname(dir)
  }
  return process.cwd()
}

const projectRoot = findProjectRoot()
const tuiBinary = path.join(projectRoot, 'tui/zig-out/bin/smithers-tui')

interface CliResult {
  stdout: string
  stderr: string
  exitCode: number
  timeout: boolean
}

async function runCliMode(prompt: string, timeoutMs = 60000): Promise<CliResult> {
  return new Promise((resolve) => {
    const proc = spawn(tuiBinary, ['--cli', prompt], {
      cwd: projectRoot,
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGKILL')
    }, timeoutMs)

    proc.stdout?.on('data', (data) => stdout += data.toString())
    proc.stderr?.on('data', (data) => stderr += data.toString())

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code ?? -1, timeout: timedOut })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr: stderr + err.message, exitCode: -1, timeout: timedOut })
    })
  })
}

function getCombinedOutput(result: CliResult): string {
  return result.stdout + result.stderr
}

function extractAssistantResponses(output: string): string {
  const regex = /\[[\d]+\] ASSISTANT:\n([\s\S]*?)(?=\n\n===|\n\[[\d]+\]|$)/g
  return [...output.matchAll(regex)].map(m => m[1]?.trim()).join('\n')
}

describe('Bash Tool', () => {
  beforeAll(() => {
    expect(existsSync(tuiBinary)).toBe(true)
    expect(process.env.ANTHROPIC_API_KEY).toBeDefined()
  })

  test('executes echo command', async () => {
    const result = await runCliMode('Run: echo "test123"')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toContain('test123')
  }, 30000)

  test('executes pwd command', async () => {
    const result = await runCliMode('What is the current directory? Use pwd.')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toMatch(/\//)
  }, 30000)

  test('handles command with special characters', async () => {
    const result = await runCliMode('Run: echo "hello world" | wc -w')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    // Should show word count of 2
    expect(output).toMatch(/2/)
  }, 30000)
})

describe('Read File Tool', () => {
  let tempDir: string
  let testFile: string

  beforeAll(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'smithers-test-'))
    testFile = path.join(tempDir, 'test.txt')
    writeFileSync(testFile, 'This is test content for reading.\nLine 2 of the test file.')
  })

  test('reads file and returns content', async () => {
    const result = await runCliMode(`Read the file at ${testFile} and show me what's in it`)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toContain('test content')
  }, 45000)

  test('handles file with multiple lines', async () => {
    const result = await runCliMode(`Read ${testFile}. How many lines does it have?`)
    const output = getCombinedOutput(result)
    const response = extractAssistantResponses(output)
    
    expect(result.timeout).toBe(false)
    expect(response).toMatch(/2|two/i)
  }, 45000)

  test('reports error for nonexistent file', async () => {
    const result = await runCliMode('Read the file /this/path/does/not/exist/xyz123.txt')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output.toLowerCase()).toMatch(/not found|error|doesn't exist|does not exist|no such file/)
  }, 45000)

  // Cleanup
  test.afterAll?.(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })
})

describe('Write File Tool', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'smithers-write-test-'))
  })

  test('creates new file with content', async () => {
    const targetFile = path.join(tempDir, 'created.txt')
    const result = await runCliMode(`Write the text "Hello from e2e test" to the file ${targetFile}`)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toContain('Agent loop finished')
    
    // Verify file was created
    if (existsSync(targetFile)) {
      const content = Bun.file(targetFile).text()
      expect(content).resolves.toContain('Hello')
    }
  }, 60000)

  test.afterAll?.(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })
})

describe('List Dir Tool', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'smithers-list-test-'))
    writeFileSync(path.join(tempDir, 'file1.txt'), 'content1')
    writeFileSync(path.join(tempDir, 'file2.txt'), 'content2')
    mkdirSync(path.join(tempDir, 'subdir'))
  })

  test('lists directory contents', async () => {
    const result = await runCliMode(`List the contents of ${tempDir}`)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toMatch(/file1|file2|subdir/i)
  }, 60000)

  test.afterAll?.(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })
})

describe('Glob Tool', () => {
  test('finds files by pattern', async () => {
    const result = await runCliMode(`Find all .zig files in ${projectRoot}/tui/src using glob`)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toMatch(/\.zig|main|app/i)
  }, 90000)
})

describe('Grep Tool', () => {
  test('searches for text in files', async () => {
    const result = await runCliMode(`Search for the text "fn main" in ${projectRoot}/tui/src/main.zig`)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toMatch(/main|found|pub fn/i)
  }, 60000)
})

describe('Edit File Tool', () => {
  let tempDir: string
  let testFile: string

  beforeAll(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'smithers-edit-test-'))
    testFile = path.join(tempDir, 'editable.txt')
    writeFileSync(testFile, 'Original content line 1\nOriginal content line 2')
  })

  test('modifies existing file', async () => {
    const result = await runCliMode(`In the file ${testFile}, replace "Original" with "Modified"`)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    
    // Verify file was modified
    if (existsSync(testFile)) {
      const content = await Bun.file(testFile).text()
      expect(content).toContain('Modified')
    }
  }, 60000)

  test.afterAll?.(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })
})

describe('Multi-Tool Chains', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'smithers-chain-test-'))
  })

  test('reads and summarizes file', async () => {
    const testFile = path.join(tempDir, 'data.json')
    writeFileSync(testFile, JSON.stringify({ name: 'test', count: 42 }))
    
    const result = await runCliMode(`Read ${testFile} and tell me the value of the "count" field`)
    const output = getCombinedOutput(result)
    const response = extractAssistantResponses(output)
    
    expect(result.timeout).toBe(false)
    expect(response).toMatch(/42/)
  }, 60000)

  test.afterAll?.(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })
})

describe('Error Recovery', () => {
  test('recovers from failed command and tries alternative', async () => {
    const result = await runCliMode('Try to read /nonexistent/file.txt. If that fails, just say "file not found"')
    const output = getCombinedOutput(result)
    const response = extractAssistantResponses(output)
    
    expect(result.timeout).toBe(false)
    // Should have handled the error gracefully
    expect(response.toLowerCase()).toMatch(/not found|error|doesn't exist|cannot|couldn't/)
  }, 60000)
})
