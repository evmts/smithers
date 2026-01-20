// Codex CLI Executor
// Executes Codex CLI commands using Bun

import type { AgentResult } from '../types.js'
import type { CodexCLIExecutionOptions } from '../types/codex.js'
import { buildCodexArgs } from './arg-builder.js'
import { parseCodexOutput } from './output-parser.js'

/** Default timeout for Codex CLI execution (5 minutes) */
export const DEFAULT_CLI_TIMEOUT_MS = 300000

/** Default number of schema validation retries */
export const DEFAULT_SCHEMA_RETRIES = 2

/**
 * Format command for logging, redacting the prompt (always last arg)
 */
function formatCommandForLogs(args: string[]): string {
  if (args.length === 0) return 'codex'
  const safe = [...args]
  if (safe.length > 0) {
    safe[safe.length - 1] = '[prompt redacted]'
  }
  return `codex ${safe.join(' ')}`
}

/**
 * Execute a single Codex CLI invocation
 */
export async function executeCodexCLIOnce(
  options: CodexCLIExecutionOptions,
  startTime: number
): Promise<AgentResult> {
  const args = buildCodexArgs(options)
  const command = ['codex', ...args]
  const timeout = options.timeout ?? DEFAULT_CLI_TIMEOUT_MS

  let proc: ReturnType<typeof Bun.spawn> | null = null
  let killed = false

  try {
    proc = Bun.spawn(command, {
      cwd: options.cwd ?? process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    })

    const timeoutId = setTimeout(() => {
      if (proc && !killed) {
        killed = true
        proc.kill()
      }
    }, timeout)

    let stdout = ''
    let stderr = ''

    if (!proc.stdout || typeof proc.stdout === 'number') {
      throw new Error('stdout is not a readable stream')
    }

    const stdoutReader = proc.stdout.getReader()
    const decoder = new TextDecoder()

    const readStream = async () => {
      while (true) {
        const { done, value } = await stdoutReader.read()
        if (done) break

        const chunk = decoder.decode(value)
        stdout += chunk
        options.onProgress?.(chunk)
      }
      return null
    }

    const stderrPromise = (async () => {
      if (!proc?.stderr || typeof proc.stderr === 'number') return
      const reader = proc.stderr.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        stderr += decoder.decode(value)
      }
    })()

    await readStream()
    await stderrPromise
    const exitCode = await proc.exited

    clearTimeout(timeoutId)

    const durationMs = Date.now() - startTime

    if (killed) {
      return {
        output: stdout || stderr,
        tokensUsed: { input: 0, output: 0 },
        turnsUsed: 0,
        stopReason: 'stop_condition',
        durationMs,
        exitCode: -1,
      }
    }

    const parsed = parseCodexOutput(stdout, options.json)

    if (exitCode !== 0) {
      return {
        output: `Codex CLI failed (exit ${exitCode})\nCommand: ${formatCommandForLogs(args)}\n\nSTDOUT:\n${parsed.output}\n\nSTDERR:\n${stderr}`,
        structured: parsed.structured,
        tokensUsed: parsed.tokensUsed,
        turnsUsed: parsed.turnsUsed,
        stopReason: 'error',
        durationMs,
        exitCode,
      }
    }

    return {
      output: parsed.output,
      structured: parsed.structured,
      tokensUsed: parsed.tokensUsed,
      turnsUsed: parsed.turnsUsed,
      stopReason: 'completed',
      durationMs,
      exitCode,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      output: `Codex CLI execution error\nCommand: ${formatCommandForLogs(args)}\nError: ${errorMessage}`,
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs,
      exitCode: -1,
    }
  }
}

/**
 * Execute Codex CLI command and return structured result
 */
export async function executeCodexCLI(options: CodexCLIExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
  return executeCodexCLIOnce(options, startTime)
}

/**
 * Execute Codex CLI using simple options
 */
export async function executeCodexShell(
  prompt: string,
  options: Partial<CodexCLIExecutionOptions> = {}
): Promise<AgentResult> {
  const executionOptions: CodexCLIExecutionOptions = { prompt, ...options }
  return executeCodexCLI(executionOptions)
}
