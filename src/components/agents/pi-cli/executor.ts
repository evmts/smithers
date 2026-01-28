import type { PiCLIExecutionOptions } from '../types/pi.js'
import type { AgentResult } from '../types/execution.js'
import { executeCLI, DEFAULT_CLI_TIMEOUT_MS } from '../shared/cli-executor.js'
import { buildPiArgs } from './arg-builder.js'
import { parsePiOutput } from './output-parser.js'
import { detectPiError } from './errors.js'

export async function executePiCLI(
  options: PiCLIExecutionOptions & { onProgress?: (chunk: string) => void }
): Promise<AgentResult> {
  const args = buildPiArgs(options)
  let turnsUsed = 0

  const { result } = await executeCLI({
    cliName: 'pi',
    args,
    command: ['pi', ...args],
    cwd: options.cwd ?? process.cwd(),
    timeout: options.timeout ?? DEFAULT_CLI_TIMEOUT_MS,
    ...(options.stopConditions ? { stopConditions: options.stopConditions } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    
    onStdoutChunk: (chunk) => {
      // Count turns from JSON events
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.type === 'turn_end') turnsUsed++
        } catch {
          // Non-JSON line, ignore
        }
      }
      return { turnsUsed }
    },
    
    parseOutput: (stdout) => parsePiOutput(stdout),
    
    formatError: (_parsed, spawnResult) => {
      const piError = detectPiError(spawnResult.stderr, spawnResult.exitCode)
      if (piError) return piError.message
      return `pi CLI failed (exit ${spawnResult.exitCode})\n\nSTDERR:\n${spawnResult.stderr}`
    },
  })

  return result
}
