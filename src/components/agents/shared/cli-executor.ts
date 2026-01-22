import type { AgentResult, StopReason } from '../types/execution.js'
import type { StopCondition } from '../types/agents.js'
import { checkStopConditions } from '../claude-cli/stop-conditions.js'

export const DEFAULT_CLI_TIMEOUT_MS = 300000

export interface CLISpawnOptions {
  command: string[]
  cwd?: string
  env?: Record<string, string | undefined>
  stdin?: string | Uint8Array
  timeout?: number
  stopConditions?: StopCondition[]
  onProgress?: (chunk: string) => void
  onStdoutChunk?: (chunk: string, accumulated: string) => StreamChunkResult | void
}

export interface StreamChunkResult {
  tokensUsed?: { input: number; output: number }
  turnsUsed?: number
  shouldStop?: boolean
}

export interface CLISpawnResult {
  stdout: string
  stderr: string
  exitCode: number
  killed: boolean
  stopTriggered: boolean
  durationMs: number
  tokensUsed: { input: number; output: number }
  turnsUsed: number
}

export async function spawnCLI(options: CLISpawnOptions): Promise<CLISpawnResult> {
  const startTime = Date.now()
  const timeout = options.timeout ?? DEFAULT_CLI_TIMEOUT_MS

  let proc: ReturnType<typeof Bun.spawn> | null = null
  let killed = false
  let stopTriggered = false
  let tokensUsed = { input: 0, output: 0 }
  let turnsUsed = 0

  proc = Bun.spawn(options.command, {
    cwd: options.cwd ?? process.cwd(),
    stdin: options.stdin ? new TextEncoder().encode(
      typeof options.stdin === 'string' ? options.stdin : new TextDecoder().decode(options.stdin)
    ) : undefined,
    stdout: 'pipe',
    stderr: 'pipe',
    env: options.env ?? process.env,
  })

  const timeoutId = timeout > 0
    ? setTimeout(() => {
        if (proc && !killed) {
          killed = true
          proc.kill()
        }
      }, timeout)
    : null

  let stdout = ''
  let stderr = ''

  if (!proc.stdout || typeof proc.stdout === 'number') {
    throw new Error('stdout is not a readable stream')
  }
  if (!proc.stderr || typeof proc.stderr === 'number') {
    throw new Error('stderr is not a readable stream')
  }

  const stdoutReader = proc.stdout.getReader()
  const stderrReader = proc.stderr.getReader()
  const decoder = new TextDecoder()

  const readStdout = async () => {
    while (true) {
      const { done, value } = await stdoutReader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      stdout += chunk

      options.onProgress?.(chunk)

      const chunkResult = options.onStdoutChunk?.(chunk, stdout)
      if (chunkResult) {
        if (chunkResult.tokensUsed) tokensUsed = chunkResult.tokensUsed
        if (chunkResult.turnsUsed !== undefined) turnsUsed = chunkResult.turnsUsed
        if (chunkResult.shouldStop) {
          stopTriggered = true
          killed = true
          proc?.kill()
          break
        }
      }

      if (options.stopConditions?.length) {
        const elapsed = Date.now() - startTime
        const partialResult: Partial<AgentResult> = {
          output: stdout,
          tokensUsed,
          turnsUsed,
          durationMs: elapsed,
        }
        const { shouldStop } = checkStopConditions(options.stopConditions, partialResult)
        if (shouldStop && !killed) {
          stopTriggered = true
          killed = true
          proc?.kill()
          break
        }
      }
    }
  }

  const readStderr = async () => {
    while (true) {
      const { done, value } = await stderrReader.read()
      if (done) break
      stderr += decoder.decode(value, { stream: true })
    }
  }

  await Promise.all([readStdout(), readStderr()])
  const exitCode = await proc.exited

  if (timeoutId) clearTimeout(timeoutId)

  return {
    stdout,
    stderr,
    exitCode,
    killed,
    stopTriggered,
    durationMs: Date.now() - startTime,
    tokensUsed,
    turnsUsed,
  }
}

export function buildAgentResult(
  spawnResult: CLISpawnResult,
  output: string,
  overrides?: Partial<AgentResult>
): AgentResult {
  const stopReason: StopReason = spawnResult.killed || spawnResult.stopTriggered
    ? 'stop_condition'
    : spawnResult.exitCode !== 0
      ? 'error'
      : 'completed'

  return {
    output,
    tokensUsed: spawnResult.tokensUsed,
    turnsUsed: spawnResult.turnsUsed,
    stopReason,
    durationMs: spawnResult.durationMs,
    exitCode: spawnResult.killed ? -1 : spawnResult.exitCode,
    ...overrides,
  }
}

export function formatErrorOutput(
  cliName: string,
  args: string[],
  stdout: string,
  stderr: string,
  exitCode: number
): string {
  return `${cliName} CLI failed (exit ${exitCode})\nCommand: ${cliName} ${args.join(' ')}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
}
