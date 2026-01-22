import type { CLIExecutionOptions, AgentResult } from '../types.js'
import {
  generateStructuredOutputPrompt,
  generateRetryPrompt,
  parseStructuredOutput,
} from '../../../utils/structured-output.js'
import { buildClaudeArgs } from './arg-builder.js'
import { parseClaudeOutput } from './output-parser.js'
import {
  executeCLI,
  formatErrorOutput,
  DEFAULT_CLI_TIMEOUT_MS,
  type StreamChunkResult,
} from '../shared/cli-executor.js'

export { DEFAULT_CLI_TIMEOUT_MS }

export const DEFAULT_SCHEMA_RETRIES = 2

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

type StreamUsage = {
  tokensUsed: { input: number; output: number }
  turnsUsed: number
}

function createClaudeStreamUsageTracker(): {
  processChunk: (chunk: string) => StreamChunkResult
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
    }
  }

  return {
    processChunk: (chunk: string): StreamChunkResult => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        applyLine(line)
      }
      return { tokensUsed, turnsUsed }
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

export async function executeClaudeCLIOnce(
  options: CLIExecutionOptions,
  startTime: number,
  useApiKey = false
): Promise<AgentResult & { sessionId?: string; shouldRetryWithApiKey?: boolean }> {
  const args = buildClaudeArgs(options)
  const command = ['claude', ...args]
  const timeout = options.timeout ?? DEFAULT_CLI_TIMEOUT_MS

  const env = useApiKey
    ? { ...process.env }
    : Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ANTHROPIC_API_KEY'))

  const usageTracker = options.outputFormat === 'stream-json'
    ? createClaudeStreamUsageTracker()
    : null

  try {
    const { result, spawnResult } = await executeCLI({
      cliName: 'claude',
      args,
      command,
      cwd: options.cwd ?? process.cwd(),
      env,
      stdin: options.prompt,
      timeout,
      ...(options.stopConditions && { stopConditions: options.stopConditions }),
      ...(options.onProgress && { onProgress: options.onProgress }),
      ...(usageTracker && { onStdoutChunk: (chunk: string) => usageTracker.processChunk(chunk) }),
      parseOutput: (stdout) => {
        usageTracker?.flush()
        return parseClaudeOutput(stdout, options.outputFormat)
      },
      formatError: (parsed, spawnResult) =>
        formatErrorOutput('claude', args, parsed.output, spawnResult.stderr, spawnResult.exitCode),
      buildStopResult: (result, spawnResult) => {
        usageTracker?.flush()
        const usage = usageTracker?.getUsage()
        return {
          ...result,
          output: spawnResult.stdout || spawnResult.stderr,
          tokensUsed: usage?.tokensUsed ?? spawnResult.tokensUsed,
          turnsUsed: usage?.turnsUsed ?? spawnResult.turnsUsed,
        }
      },
    })

    const sessionMatch = spawnResult.stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    const sessionId = sessionMatch?.[1]
    const shouldRetry = !useApiKey && shouldFallbackToApiKey(spawnResult.stdout, spawnResult.stderr, spawnResult.exitCode)

    return {
      ...result,
      ...(sessionId ? { sessionId } : {}),
      ...(shouldRetry ? { shouldRetryWithApiKey: true } : {}),
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      output: `Claude CLI execution error\nCommand: claude ${args.join(' ')}\nError: ${errorMessage}`,
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs,
      exitCode: -1,
    }
  }
}

export async function executeClaudeCLI(options: CLIExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
  const maxSchemaRetries = options.schemaRetries ?? DEFAULT_SCHEMA_RETRIES

  let effectiveOptions = { ...options }

  if (options.maxTokens !== undefined) {
    const tokenLimitCondition = {
      type: 'token_limit' as const,
      value: options.maxTokens,
      message: `Token limit ${options.maxTokens} exceeded`,
    }
    effectiveOptions.stopConditions = [
      ...(effectiveOptions.stopConditions ?? []),
      tokenLimitCondition,
    ]
  }

  if (options.schema) {
    const schemaPrompt = generateStructuredOutputPrompt(options.schema)
    effectiveOptions.systemPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${schemaPrompt}`
      : schemaPrompt
  }

  let useApiKey = !(options.useSubscription ?? true)
  let result = await executeClaudeCLIOnce(effectiveOptions, startTime, useApiKey)
  let activeSessionId = result.sessionId ?? effectiveOptions.resume

  if (result.shouldRetryWithApiKey && process.env['ANTHROPIC_API_KEY']) {
    options.onProgress?.('Subscription auth failed, retrying with API key...')
    useApiKey = true
    result = await executeClaudeCLIOnce(effectiveOptions, startTime, true)
    activeSessionId = result.sessionId ?? activeSessionId
  }

  if (!options.schema) {
    return result
  }

  let schemaRetryCount = 0
  while (schemaRetryCount < maxSchemaRetries) {
    if (result.stopReason === 'error') {
      return result
    }

    const parseResult = parseStructuredOutput(result.output, options.schema)

    if (parseResult.success) {
      return {
        ...result,
        structured: parseResult.data,
      }
    }

    schemaRetryCount++
    options.onProgress?.(
      `Schema validation failed (attempt ${schemaRetryCount}/${maxSchemaRetries}): ${parseResult.error}`
    )

    const retryPrompt = generateRetryPrompt(result.output, parseResult.error!)

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

  if (result.stopReason !== 'error') {
    const finalParseResult = parseStructuredOutput(result.output, options.schema)
    if (finalParseResult.success) {
      return {
        ...result,
        structured: finalParseResult.data,
      }
    }

    return {
      ...result,
      stopReason: 'error',
      output: `Schema validation failed after ${maxSchemaRetries} retries: ${finalParseResult.error}\n\nLast output: ${result.output}`,
    }
  }

  return result
}

export async function executeClaudeShell(
  prompt: string,
  options: Partial<CLIExecutionOptions> = {}
): Promise<AgentResult> {
  const executionOptions: CLIExecutionOptions = { prompt, ...options }
  return executeClaudeCLI(executionOptions)
}
