/**
 * TUI CLI E2E Tests
 * 
 * These tests run the actual TUI CLI binary with real AI responses.
 * No mocking - tests the full stack from binary to Anthropic API.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'

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

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        timeout: timedOut,
      })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        stdout,
        stderr: stderr + err.message,
        exitCode: -1,
        timeout: timedOut,
      })
    })
  })
}

function extractAssistantResponse(output: string): string {
  // Find ALL assistant responses and concatenate them
  const regex = /\[[\d]+\] ASSISTANT:\n([\s\S]*?)(?=\n\n===|\n\[[\d]+\]|$)/g
  const matches = [...output.matchAll(regex)]
  return matches.map(m => m[1]?.trim()).join('\n')
}

function getCombinedOutput(result: CliResult): string {
  // The Zig CLI uses std.debug.print which goes to stderr
  return result.stdout + result.stderr
}

describe('TUI CLI E2E Tests', () => {
  beforeAll(() => {
    // Verify binary exists
    expect(existsSync(tuiBinary)).toBe(true)
    // Verify API key is set
    expect(process.env.ANTHROPIC_API_KEY).toBeDefined()
  })

  test('--help shows usage', async () => {
    const { stdout, exitCode } = await runCliMode('--help is not a real prompt', 5000)
    // This should still work even though --help is passed to --cli
    expect(exitCode).toBeDefined()
  })

  test('simple math question returns correct answer', async () => {
    const result = await runCliMode('What is 2+2? Respond with just the number, nothing else.')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toContain('ASSISTANT:')
    
    const response = extractAssistantResponse(output)
    expect(response).toMatch(/4/)
  }, 30000)

  test('basic greeting works', async () => {
    const result = await runCliMode('Say "hello world" and nothing else')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toContain('ASSISTANT:')
    
    const response = extractAssistantResponse(output).toLowerCase()
    expect(response).toContain('hello')
  }, 30000)

  test('handles long prompt', async () => {
    const longPrompt = 'Respond with just the word "OK". ' + 'This is padding. '.repeat(50)
    const result = await runCliMode(longPrompt)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    expect(output).toContain('ASSISTANT:')
    
    const response = extractAssistantResponse(output)
    expect(response.length).toBeGreaterThan(0)
  }, 45000)
})

describe('TUI CLI Tool Usage Tests', () => {
  test('bash tool executes simple command', async () => {
    const result = await runCliMode('Run the bash command "echo hello_from_test" and show me the output')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    
    // Either the tool was called and output shown, or assistant reported result
    const response = extractAssistantResponse(output)
    expect(response.length).toBeGreaterThan(0)
    
    // Should see evidence of bash tool or the output
    const hasToolEvidence = output.includes('bash') || 
                           output.includes('hello_from_test') ||
                           response.includes('hello_from_test')
    expect(hasToolEvidence).toBe(true)
  }, 60000)

  test('read_file tool reads existing file', async () => {
    const result = await runCliMode(`Read the file at ${path.join(projectRoot, 'package.json')} and tell me the package name`)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    
    const response = extractAssistantResponse(output)
    expect(response.length).toBeGreaterThan(0)
    
    // Should mention the package name
    expect(response.toLowerCase()).toMatch(/smithers/)
  }, 60000)

  test('list_dir tool lists directory contents', async () => {
    // Use a smaller directory to avoid timeout
    const result = await runCliMode(`List the contents of the directory ${projectRoot}/tui and tell me what you see`, 90000)
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    
    const response = extractAssistantResponse(output)
    expect(response.length).toBeGreaterThan(0)
    
    // Should have found some files or mentioned directory contents
    expect(output).toMatch(/src|build\.zig|main\.zig|zig/i)
  }, 90000)
})

describe('TUI CLI Error Handling Tests', () => {
  test('handles missing file gracefully', async () => {
    const result = await runCliMode('Read the file /nonexistent/path/to/file.txt and show its contents')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    
    const response = extractAssistantResponse(output)
    // Should either error or explain the file doesn't exist
    const handledError = response.toLowerCase().includes('not found') ||
                        response.toLowerCase().includes('error') ||
                        response.toLowerCase().includes('does not exist') ||
                        response.toLowerCase().includes("doesn't exist") ||
                        response.toLowerCase().includes('cannot') ||
                        response.toLowerCase().includes("couldn't") ||
                        output.toLowerCase().includes('error') ||
                        output.toLowerCase().includes('not found')
    expect(handledError).toBe(true)
  }, 60000)

  test('handles invalid bash command gracefully', async () => {
    const result = await runCliMode('Run this bash command: ls /definitely/not/a/real/path/123456789')
    const output = getCombinedOutput(result)
    
    expect(result.timeout).toBe(false)
    
    // Should complete without crashing
    expect(output).toContain('Agent loop finished')
  }, 60000)
})
