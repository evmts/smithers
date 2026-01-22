import { buildAmpArgs, buildAmpEnv } from './arg-builder.js'
import { parseAmpOutput } from './output-parser.js'
import { AmpStreamParser } from '../../../streaming/amp-parser.js'
import { executeCLI, DEFAULT_CLI_TIMEOUT_MS } from '../shared/cli-executor.js'
import type { AmpCLIExecutionOptions } from '../types/amp.js'
import type { AgentResult } from '../types/execution.js'
import type { StopCondition } from '../types/agents.js'

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

export async function executeAmpCLI(options: AmpCLIExecutionOptions): Promise<AgentResult> {
  const args = buildAmpArgs(options)
  const env = buildAmpEnv(options)
  const stopConditions: StopCondition[] = options.stopConditions ? [...options.stopConditions] : []
  
  if (options.maxTurns !== undefined) {
    stopConditions.push({
      type: 'turn_limit',
      value: options.maxTurns,
      message: `Turn limit ${options.maxTurns} exceeded`,
    })
  }
  
  const prompt = buildAmpPrompt(options)
  const streamParser = new AmpStreamParser()
  let outputText = ''
  let tokensUsed = { input: 0, output: 0 }
  let turnsUsed = 0

  const processStreamParts = (parts: ReturnType<typeof streamParser.parse>) => {
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
  }

  const { result } = await executeCLI({
    cliName: 'amp',
    args,
    command: ['amp', ...args],
    cwd: options.cwd ?? process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdin: prompt,
    timeout: options.timeout ?? DEFAULT_CLI_TIMEOUT_MS,
    stopConditions,
    ...(options.onProgress && { onProgress: options.onProgress }),
    onStdoutChunk: (chunk: string) => {
      const parts = streamParser.parse(chunk)
      processStreamParts(parts)
      return {
        tokensUsed,
        turnsUsed,
      }
    },
    parseOutput: (stdout, exitCode) => {
      const remainingParts = streamParser.flush()
      processStreamParts(remainingParts)
      const parsed = parseAmpOutput(stdout, exitCode)
      return {
        output: parsed.output,
        tokensUsed: (tokensUsed.input || tokensUsed.output) ? tokensUsed : parsed.tokensUsed,
        turnsUsed: turnsUsed > 0 ? turnsUsed : parsed.turnsUsed,
        ...(parsed.sessionId && { sessionId: parsed.sessionId }),
      }
    },
    getStopOutput: (spawnResult) => outputText.trim() || spawnResult.stdout || spawnResult.stderr,
    formatError: (parsed, spawnResult) => {
      if (spawnResult.stderr) {
        return parsed.output ? `${parsed.output}\n\nError: ${spawnResult.stderr}` : spawnResult.stderr
      }
      return parsed.output
    },
    buildResult: (result, parsed) => {
      if (parsed.sessionId) {
        return { ...result, sessionId: parsed.sessionId }
      }
      return result
    },
    buildStopResult: (result, spawnResult) => {
      const remainingParts = streamParser.flush()
      processStreamParts(remainingParts)
      return {
        ...result,
        output: outputText.trim() || spawnResult.stdout || spawnResult.stderr,
      }
    },
  })

  return result
}
