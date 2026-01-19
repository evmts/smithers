// Amp CLI executor
// Spawns and manages amp CLI process

import { buildAmpArgs, buildAmpEnv } from './arg-builder.js'
import { parseAmpOutput } from './output-parser.js'
import type { AmpCLIExecutionOptions } from '../types/amp.js'
import type { AgentResult } from '../types/execution.js'

/**
 * Execute amp CLI with the given options
 */
export async function executeAmpCLI(options: AmpCLIExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
  const args = buildAmpArgs(options)
  const env = buildAmpEnv(options)

  const proc = Bun.spawn(['amp', ...args], {
    cwd: options.cwd ?? process.cwd(),
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      ...env,
    },
  })

  // Write prompt to stdin
  await proc.stdin.write(new TextEncoder().encode(options.prompt))
  await proc.stdin.end()

  // Collect output
  let stdout = ''
  let stderr = ''

  // Stream stdout for progress callbacks
  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    stdout += chunk

    // Call progress callback with raw chunk
    options.onProgress?.(chunk)
  }

  // Read any remaining stderr
  const stderrReader = proc.stderr.getReader()
  while (true) {
    const { done, value } = await stderrReader.read()
    if (done) break
    stderr += decoder.decode(value, { stream: true })
  }

  const exitCode = await proc.exited
  const durationMs = Date.now() - startTime

  // Parse output
  const result = parseAmpOutput(stdout, exitCode)
  result.durationMs = durationMs

  // If there was an error, include stderr in output
  if (exitCode !== 0 && stderr) {
    result.output = result.output ? `${result.output}\n\nError: ${stderr}` : stderr
  }

  return result
}
