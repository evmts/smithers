import { buildAmpArgs, buildAmpEnv } from './arg-builder.js'
import { parseAmpOutput } from './output-parser.js'
import { checkStopConditions } from '../claude-cli/stop-conditions.js'
import { AmpStreamParser } from '../../../streaming/amp-parser.js'
import type { AmpCLIExecutionOptions } from '../types/amp.js'
import type { AgentResult } from '../types/execution.js'

const DEFAULT_AMP_TIMEOUT_MS = 300000

function buildAmpPrompt(options: AmpCLIExecutionOptions): string {
  const parts: string[] = []

  if (options.systemPrompt) {
    parts.push(`System:\n${options.systemPrompt}`)
  }

  if (options.maxTurns !== undefined) {
    parts.push(`Constraint: Limit to ${options.maxTurns} turns.`)
  }

  parts.push(options.prompt)

  return parts.join('\n\n')
}

/**
 * Execute amp CLI with the given options
 */
export async function executeAmpCLI(options: AmpCLIExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
  const args = buildAmpArgs(options)
  const env = buildAmpEnv(options)
  const timeoutMs = options.timeout ?? DEFAULT_AMP_TIMEOUT_MS
  const stopConditions = options.stopConditions ? [...options.stopConditions] : []
  if (options.maxTurns !== undefined) {
    stopConditions.push({
      type: 'turn_limit',
      value: options.maxTurns,
      message: `Turn limit ${options.maxTurns} exceeded`,
    })
  }
  const prompt = buildAmpPrompt(options)

  let proc: ReturnType<typeof Bun.spawn> | null = null
  let killed = false

  proc = Bun.spawn(['amp', ...args], {
    cwd: options.cwd ?? process.cwd(),
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      ...env,
    },
  })

  const timeoutId = timeoutMs > 0
    ? setTimeout(() => {
      if (proc && !killed) {
        killed = true
        proc.kill()
      }
    }, timeoutMs)
    : null

  // Write prompt to stdin
  if (!proc.stdin || typeof proc.stdin === 'number') {
    throw new Error('Failed to get stdin handle')
  }
  const stdin = proc.stdin as import('bun').FileSink
  await stdin.write(new TextEncoder().encode(prompt))
  await stdin.end()

  // Collect output
  let stdout = ''
  let stderr = ''
  let tokensUsed = { input: 0, output: 0 }
  let turnsUsed = 0
  let outputText = ''
  let stopTriggered = false
  const streamParser = new AmpStreamParser()

  if (!proc.stdout || typeof proc.stdout === 'number') {
    throw new Error('Failed to get stdout handle')
  }
  if (!proc.stderr || typeof proc.stderr === 'number') {
    throw new Error('Failed to get stderr handle')
  }
  const stdoutReader = (proc.stdout as ReadableStream<Uint8Array>).getReader()
  const stderrReader = (proc.stderr as ReadableStream<Uint8Array>).getReader()
  const stdoutDecoder = new TextDecoder()
  const stderrDecoder = new TextDecoder()

  const readStdout = async () => {
    while (true) {
      const { done, value } = await stdoutReader.read()
      if (done) break

      const chunk = stdoutDecoder.decode(value, { stream: true })
      stdout += chunk

      const parts = streamParser.parse(chunk)
      for (const part of parts) {
        if (part.type === 'finish') {
          tokensUsed = {
            input: part.usage.inputTokens.total ?? 0,
            output: part.usage.outputTokens.total ?? 0,
          }
        } else if (part.type === 'text-start') {
          turnsUsed += 1
        } else if (part.type === 'text-delta') {
          outputText += part.delta
        } else if (part.type === 'tool-call') {
          if (options.onToolCall) {
            try {
              options.onToolCall(part.toolName, JSON.parse(part.input))
            } catch {
              options.onToolCall(part.toolName, part.input)
            }
          }
        }
      }

      // Call progress callback with raw chunk
      options.onProgress?.(chunk)

      const elapsed = Date.now() - startTime
      const partialResult: Partial<AgentResult> = {
        output: outputText,
        tokensUsed,
        turnsUsed,
        durationMs: elapsed,
      }

      const { shouldStop } = checkStopConditions(stopConditions, partialResult)
      if (shouldStop && !killed) {
        stopTriggered = true
        killed = true
        proc?.kill()
        break
      }
    }
  }

  const readStderr = async () => {
    while (true) {
      const { done, value } = await stderrReader.read()
      if (done) break
      stderr += stderrDecoder.decode(value, { stream: true })
    }
  }

  await Promise.all([readStdout(), readStderr()])

  const remainingParts = streamParser.flush()
  for (const part of remainingParts) {
    if (part.type === 'finish') {
      tokensUsed = {
        input: part.usage.inputTokens.total ?? 0,
        output: part.usage.outputTokens.total ?? 0,
      }
    } else if (part.type === 'text-start') {
      turnsUsed += 1
    } else if (part.type === 'text-delta') {
      outputText += part.delta
    } else if (part.type === 'tool-call') {
      if (options.onToolCall) {
        try {
          options.onToolCall(part.toolName, JSON.parse(part.input))
        } catch {
          options.onToolCall(part.toolName, part.input)
        }
      }
    }
  }

  const exitCode = await proc.exited
  const durationMs = Date.now() - startTime

  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  if (killed || stopTriggered) {
    return {
      output: outputText.trim() || stdout || stderr,
      tokensUsed,
      turnsUsed,
      stopReason: 'stop_condition',
      durationMs,
      exitCode: -1,
    }
  }

  // Parse output
  const result = parseAmpOutput(stdout, exitCode)
  result.durationMs = durationMs
  if (tokensUsed.input || tokensUsed.output) {
    result.tokensUsed = tokensUsed
  }
  if (turnsUsed > 0) {
    result.turnsUsed = turnsUsed
  }

  // If there was an error, include stderr in output
  if (exitCode !== 0 && stderr) {
    result.output = result.output ? `${result.output}\n\nError: ${stderr}` : stderr
  }

  return result
}
