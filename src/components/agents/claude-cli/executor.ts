// Claude CLI Executor
// Executes Claude CLI commands using Bun

import type { CLIExecutionOptions, AgentResult } from '../types.js'
import {
  generateStructuredOutputPrompt,
  generateRetryPrompt,
  parseStructuredOutput,
} from '../../../utils/structured-output.js'
import { buildClaudeArgs } from './arg-builder.js'
import { checkStopConditions } from './stop-conditions.js'
import { parseClaudeOutput } from './output-parser.js'

/** Default timeout for Claude CLI execution (5 minutes) */
export const DEFAULT_CLI_TIMEOUT_MS = 300000

/** Default number of schema validation retries */
export const DEFAULT_SCHEMA_RETRIES = 2

/**
 * Check if CLI output indicates subscription/auth failure that could be retried with API key
 */
function shouldFallbackToApiKey(stdout: string, stderr: string, exitCode: number): boolean {
  if (exitCode === 0) return false
  const combined = `${stdout}\n${stderr}`.toLowerCase()
  return (
    combined.includes('subscription') ||
    combined.includes('billing') ||
    combined.includes('credits') ||
    combined.includes('quota') ||
    combined.includes('unauthorized') ||
    combined.includes('authentication') ||
    combined.includes('not logged in') ||
    combined.includes('login required') ||
    combined.includes('invalid api key') ||
    combined.includes('please run /login') ||
    combined.includes('api key')
  )
}

/**
 * Format command for logging, redacting the prompt (always last arg)
 */
function formatCommandForLogs(args: string[]): string {
  if (args.length === 0) return 'claude'
  const safe = [...args]
  if (safe.length > 0) {
    safe[safe.length - 1] = '[prompt redacted]'
  }
  return `claude ${safe.join(' ')}`
}

type StreamUsage = {
  tokensUsed: { input: number; output: number }
  turnsUsed: number
}

function createClaudeStreamUsageTracker(): {
  push: (chunk: string) => void
  flush: () => void
  getUsage: () => StreamUsage
} {
  let buffer = ''
  let tokensUsed = { input: 0, output: 0 }
  let turnsUsed = 0

  const applyLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>
      if (event['type'] === 'message_stop') {
        const usage = event['usage'] as Record<string, unknown> | undefined
        if (usage) {
          const inputTokens = typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : 0
          const outputTokens = typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : 0
          tokensUsed = { input: inputTokens, output: outputTokens }
        }
      }
      if (typeof event['turns'] === 'number') {
        turnsUsed = event['turns'] as number
      }
    } catch {
      // Ignore malformed lines
    }
  }

  return {
    push: (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        applyLine(line)
      }
    },
    flush: () => {
      if (buffer.trim()) {
        applyLine(buffer)
      }
      buffer = ''
    },
    getUsage: () => ({ tokensUsed, turnsUsed }),
  }
}

/**
 * Execute a single Claude CLI invocation (internal helper)
 */
export async function executeClaudeCLIOnce(
  options: CLIExecutionOptions,
  startTime: number,
  useApiKey = false
): Promise<AgentResult & { sessionId?: string; shouldRetryWithApiKey?: boolean }> {
  const args = buildClaudeArgs(options)

  // Build the command
  const command = ['claude', ...args]

  // Set up timeout
  const timeout = options.timeout ?? DEFAULT_CLI_TIMEOUT_MS

  let proc: ReturnType<typeof Bun.spawn> | null = null
  let killed = false

  try {
    // Build environment - try subscription first (no API key), fall back to API key if specified
    const env = useApiKey
      ? { ...process.env }
      : Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ANTHROPIC_API_KEY'))

    // Execute using Bun.spawn for streaming output
    proc = Bun.spawn(command, {
      cwd: options.cwd ?? process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      env,
    })

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (proc && !killed) {
        killed = true
        proc.kill()
      }
    }, timeout)

    // Collect output
    let stdout = ''
    let stderr = ''

    // Read stdout
    if (!proc.stdout || typeof proc.stdout === 'number') {
      throw new Error('stdout is not a readable stream')
    }
    const stdoutReader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    const usageTracker = options.outputFormat === 'stream-json'
      ? createClaudeStreamUsageTracker()
      : null

    const readStream = async () => {
      while (true) {
        const { done, value } = await stdoutReader.read()
        if (done) break

        const chunk = decoder.decode(value)
        stdout += chunk
        usageTracker?.push(chunk)

        // Report progress
        options.onProgress?.(chunk)

        // Check stop conditions periodically
        const elapsed = Date.now() - startTime
        const usage = usageTracker?.getUsage()
        const partialResult: Partial<AgentResult> = {
          output: stdout,
          ...(usage?.tokensUsed && { tokensUsed: usage.tokensUsed }),
          ...(usage?.turnsUsed !== undefined && { turnsUsed: usage.turnsUsed }),
          durationMs: elapsed,
        }

        const { shouldStop, reason: _reason } = checkStopConditions(
          options.stopConditions,
          partialResult
        )

        if (shouldStop) {
          killed = true
          proc?.kill()
          clearTimeout(timeoutId)

          return {
            output: stdout,
            tokensUsed: usage?.tokensUsed ?? { input: 0, output: 0 },
            turnsUsed: usage?.turnsUsed ?? 0,
            stopReason: 'stop_condition' as const,
            durationMs: elapsed,
          }
        }
      }

      return null
    }

    // Read stderr
    const stderrPromise = (async () => {
      if (!proc?.stderr || typeof proc.stderr === 'number') {
        return
      }
      const reader = proc.stderr.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        stderr += decoder.decode(value)
      }
    })()

    // Wait for both streams and exit
    const earlyResult = await readStream()
    if (earlyResult) {
      return earlyResult
    }

    await stderrPromise
    usageTracker?.flush()
    const exitCode = await proc.exited

    clearTimeout(timeoutId)

    const durationMs = Date.now() - startTime

    // Check if we were killed by timeout
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

    // Parse the output
    const parsed = parseClaudeOutput(stdout, options.outputFormat)

    // Try to extract session ID from stderr (Claude CLI outputs session info there)
    const sessionMatch = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    const sessionId = sessionMatch?.[1]

    const shouldRetry = !useApiKey && shouldFallbackToApiKey(stdout, stderr, exitCode)
    const output = exitCode !== 0
      ? `Claude CLI failed (exit ${exitCode})\nCommand: ${formatCommandForLogs(args)}\n\nSTDOUT:\n${parsed.output}\n\nSTDERR:\n${stderr}`
      : parsed.output

    if (exitCode !== 0) {
      return {
        output,
        structured: parsed.structured,
        tokensUsed: parsed.tokensUsed,
        turnsUsed: parsed.turnsUsed,
        stopReason: 'error',
        durationMs,
        exitCode,
        ...(sessionId ? { sessionId } : {}),
        ...(shouldRetry ? { shouldRetryWithApiKey: true } : {}),
      }
    }

    return {
      output,
      structured: parsed.structured,
      tokensUsed: parsed.tokensUsed,
      turnsUsed: parsed.turnsUsed,
      stopReason: 'completed',
      durationMs,
      exitCode,
      ...(sessionId ? { sessionId } : {}),
      ...(shouldRetry ? { shouldRetryWithApiKey: true } : {}),
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      output: `Claude CLI execution error\nCommand: ${formatCommandForLogs(args)}\nError: ${errorMessage}`,
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs,
      exitCode: -1,
    }
  }
}

/**
 * Execute Claude CLI command and return structured result.
 * If a schema is provided, validates the output and retries with --continue on failure.
 */
export async function executeClaudeCLI(options: CLIExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
  const maxSchemaRetries = options.schemaRetries ?? DEFAULT_SCHEMA_RETRIES

  // If schema is provided, add structured output instructions to system prompt
  let effectiveOptions = { ...options }
  if (options.schema) {
    const schemaPrompt = generateStructuredOutputPrompt(options.schema)
    effectiveOptions.systemPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${schemaPrompt}`
      : schemaPrompt
  }

  // Execute the initial request - try subscription first (no API key)
  let useApiKey = !(options.useSubscription ?? true)
  let result = await executeClaudeCLIOnce(effectiveOptions, startTime, useApiKey)
  let activeSessionId = result.sessionId ?? effectiveOptions.resume

  // If subscription failed and API key is available, retry with API key
  if (result.shouldRetryWithApiKey && process.env['ANTHROPIC_API_KEY']) {
    options.onProgress?.('Subscription auth failed, retrying with API key...')
    useApiKey = true
    result = await executeClaudeCLIOnce(effectiveOptions, startTime, true)
    activeSessionId = result.sessionId ?? activeSessionId
  }

  // If no schema, just return the result
  if (!options.schema) {
    return result
  }

  // Validate against schema and retry on failure
  let schemaRetryCount = 0
  while (schemaRetryCount < maxSchemaRetries) {
    // Skip validation if there was an execution error
    if (result.stopReason === 'error') {
      return result
    }

    // Parse and validate the output
    const parseResult = parseStructuredOutput(result.output, options.schema)

    if (parseResult.success) {
      // Validation passed - return result with typed structured data
      return {
        ...result,
        structured: parseResult.data,
      }
    }

    // Validation failed - retry by continuing the session
    schemaRetryCount++
    options.onProgress?.(
      `Schema validation failed (attempt ${schemaRetryCount}/${maxSchemaRetries}): ${parseResult.error}`
    )

    // Generate retry prompt with error feedback
    const retryPrompt = generateRetryPrompt(result.output, parseResult.error!)

    // Continue the session with the error feedback
    const retryOptions: CLIExecutionOptions = {
      ...effectiveOptions,
      prompt: retryPrompt,
    }
    if (activeSessionId) {
      retryOptions.resume = activeSessionId
      delete retryOptions.continue
    } else {
      retryOptions.continue = true
    }

    result = await executeClaudeCLIOnce(retryOptions, startTime, useApiKey)
    activeSessionId = result.sessionId ?? activeSessionId
  }

  // Final validation attempt after all retries
  if (result.stopReason !== 'error') {
    const finalParseResult = parseStructuredOutput(result.output, options.schema)
    if (finalParseResult.success) {
      return {
        ...result,
        structured: finalParseResult.data,
      }
    }

    // All retries exhausted - return error
    return {
      ...result,
      stopReason: 'error',
      output: `Schema validation failed after ${maxSchemaRetries} retries: ${finalParseResult.error}\n\nLast output: ${result.output}`,
    }
  }

  return result
}

/**
 * Execute Claude CLI using Bun.$ shell syntax
 * Simpler alternative for basic usage
 */
export async function executeClaudeShell(
  prompt: string,
  options: Partial<CLIExecutionOptions> = {}
): Promise<AgentResult> {
  const executionOptions: CLIExecutionOptions = { prompt, ...options }
  return executeClaudeCLI(executionOptions)
}
