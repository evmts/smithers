import type { AgentResult } from '../types.js'
import type { CodexCLIExecutionOptions } from '../types/codex.js'
import { executeCLI, formatErrorOutput, DEFAULT_CLI_TIMEOUT_MS } from '../shared/cli-executor.js'
import { buildCodexArgs } from './arg-builder.js'
import { parseCodexOutput } from './output-parser.js'
import { zodToJsonSchema } from '../../../utils/structured-output.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export { DEFAULT_CLI_TIMEOUT_MS }

export const DEFAULT_SCHEMA_RETRIES = 2

async function createTempSchemaFile(schema: import('zod').ZodType): Promise<string> {
  const jsonSchema = zodToJsonSchema(schema)
  const fileName = `codex-schema-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  const filePath = join(tmpdir(), fileName)
  await Bun.write(filePath, JSON.stringify(jsonSchema))
  return filePath
}

function formatCommandForLogs(args: string[]): string {
  if (args.length === 0) return 'codex'
  const safe = [...args]
  if (safe.length > 0) {
    safe[safe.length - 1] = '[prompt redacted]'
  }
  return `codex ${safe.join(' ')}`
}

export async function executeCodexCLIOnce(
  options: CodexCLIExecutionOptions,
  startTime: number
): Promise<AgentResult> {
  const args = buildCodexArgs(options)

  try {
    const safeArgs = [...args]
    if (safeArgs.length > 0) {
      safeArgs[safeArgs.length - 1] = '[prompt redacted]'
    }

    const { result } = await executeCLI({
      cliName: 'Codex',
      args: safeArgs,
      command: ['codex', ...args],
      timeout: options.timeout ?? DEFAULT_CLI_TIMEOUT_MS,
      ...(options.cwd && { cwd: options.cwd }),
      ...(options.onProgress && { onProgress: options.onProgress }),
      parseOutput: (stdout) => parseCodexOutput(stdout, options.json),
      formatError: (parsed, spawnResult) =>
        formatErrorOutput('Codex', safeArgs, parsed.output, spawnResult.stderr, spawnResult.exitCode),
      buildResult: (result) => ({ ...result, durationMs: Date.now() - startTime }),
      buildStopResult: (result) => ({ ...result, durationMs: Date.now() - startTime }),
    })

    return result
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

export async function executeCodexCLI(options: CodexCLIExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
  
  let schemaFilePath: string | undefined
  let effectiveOptions = options
  
  if (options.schema && !options.outputSchema) {
    schemaFilePath = await createTempSchemaFile(options.schema)
    effectiveOptions = { ...options, outputSchema: schemaFilePath, json: true }
  }
  
  try {
    return await executeCodexCLIOnce(effectiveOptions, startTime)
  } finally {
    if (schemaFilePath) {
      try {
        const { unlink } = await import('node:fs/promises')
        await unlink(schemaFilePath)
      } catch {}
    }
  }
}

export async function executeCodexShell(
  prompt: string,
  options: Partial<CodexCLIExecutionOptions> = {}
): Promise<AgentResult> {
  const executionOptions: CodexCLIExecutionOptions = { prompt, ...options }
  return executeCodexCLI(executionOptions)
}
