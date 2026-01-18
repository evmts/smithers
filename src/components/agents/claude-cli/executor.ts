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

/**
 * Execute a single Claude CLI invocation (internal helper)
 */
export async function executeClaudeCLIOnce(
  options: CLIExecutionOptions,
  startTime: number
): Promise<AgentResult & { sessionId?: string }> {
  const args = buildClaudeArgs(options)

  // Build the command
  const command = ['claude', ...args]

  // Set up timeout
  const timeout = options.timeout ?? 300000 // 5 minutes default

  let proc: ReturnType<typeof Bun.spawn> | null = null
  let killed = false

  try {
    // Execute using Bun.spawn for streaming output
    proc = Bun.spawn(command, {
      cwd: options.cwd ?? process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
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

    const readStream = async () => {
      while (true) {
        const { done, value } = await stdoutReader.read()
        if (done) break

        const chunk = decoder.decode(value)
        stdout += chunk

        // Report progress
        options.onProgress?.(chunk)

        // Check stop conditions periodically
        const elapsed = Date.now() - startTime
        const partialResult: Partial<AgentResult> = {
          output: stdout,
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
            tokensUsed: { input: 0, output: 0 },
            turnsUsed: 0,
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

    if (exitCode !== 0) {
      return {
        output: `Claude CLI failed with exit code ${exitCode}\n\nCommand: claude ${args.join(' ')}\n\nSTDOUT:\n${parsed.output}\n\nSTDERR:\n${stderr}`,
        structured: parsed.structured,
        tokensUsed: parsed.tokensUsed,
        turnsUsed: parsed.turnsUsed,
        stopReason: 'error',
        durationMs,
        exitCode,
        ...(sessionId ? { sessionId } : {}),
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
      ...(sessionId ? { sessionId } : {}),
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      output: errorMessage,
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
  const maxSchemaRetries = options.schemaRetries ?? 2

  // If schema is provided, add structured output instructions to system prompt
  let effectiveOptions = { ...options }
  if (options.schema) {
    const schemaPrompt = generateStructuredOutputPrompt(options.schema)
    effectiveOptions.systemPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${schemaPrompt}`
      : schemaPrompt
  }

  // Execute the initial request
  let result = await executeClaudeCLIOnce(effectiveOptions, startTime)

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
      continue: true, // Use --continue to maintain context
    }

    result = await executeClaudeCLIOnce(retryOptions, startTime)
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
  const startTime = Date.now()

  const args = buildClaudeArgs({ ...options, prompt })
  const argsString = args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')

  try {
    const result = await Bun.$`claude ${argsString}`.text()

    const durationMs = Date.now() - startTime
    const parsed = parseClaudeOutput(result, options.outputFormat)

    return {
      output: parsed.output,
      structured: parsed.structured,
      tokensUsed: parsed.tokensUsed,
      turnsUsed: parsed.turnsUsed,
      stopReason: 'completed',
      durationMs,
      exitCode: 0,
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime

    return {
      output: error.stderr || error.message || String(error),
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs,
      exitCode: error.exitCode ?? -1,
    }
  }
}
