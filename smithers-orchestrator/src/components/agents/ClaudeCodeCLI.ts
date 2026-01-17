// Claude Code CLI Executor
// Builds and executes Claude CLI commands using Bun.$

import type {
  CLIExecutionOptions,
  AgentResult,
  StopCondition,
  ClaudeModel,
  ClaudePermissionMode,
  ClaudeOutputFormat,
} from './types'

// ============================================================================
// CLI Command Builder
// ============================================================================

/**
 * Build Claude CLI arguments from options
 */
export function buildClaudeArgs(options: CLIExecutionOptions): string[] {
  const args: string[] = []

  // Print mode for non-interactive execution
  args.push('--print')

  // Model
  if (options.model) {
    const modelMap: Record<string, string> = {
      opus: 'claude-opus-4',
      sonnet: 'claude-sonnet-4',
      haiku: 'claude-haiku-3',
    }
    const modelId = modelMap[options.model] || options.model
    args.push('--model', modelId)
  }

  // Max turns
  if (options.maxTurns !== undefined) {
    args.push('--max-turns', String(options.maxTurns))
  }

  // Permission mode
  if (options.permissionMode) {
    const permissionFlags: Record<ClaudePermissionMode, string[]> = {
      default: [],
      acceptEdits: ['--dangerously-skip-permissions'],
      bypassPermissions: ['--dangerously-skip-permissions'],
    }
    args.push(...permissionFlags[options.permissionMode])
  }

  // System prompt
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt)
  }

  // Output format
  if (options.outputFormat) {
    const formatMap: Record<ClaudeOutputFormat, string> = {
      text: 'text',
      json: 'json',
      'stream-json': 'stream-json',
    }
    args.push('--output-format', formatMap[options.outputFormat])
  }

  // MCP config
  if (options.mcpConfig) {
    args.push('--mcp-config', options.mcpConfig)
  }

  // Allowed tools
  if (options.allowedTools && options.allowedTools.length > 0) {
    for (const tool of options.allowedTools) {
      args.push('--allowedTools', tool)
    }
  }

  // Disallowed tools
  if (options.disallowedTools && options.disallowedTools.length > 0) {
    for (const tool of options.disallowedTools) {
      args.push('--disallowedTools', tool)
    }
  }

  // Continue conversation
  if (options.continue) {
    args.push('--continue')
  }

  // Resume session
  if (options.resume) {
    args.push('--resume', options.resume)
  }

  // Add the prompt last
  args.push(options.prompt)

  return args
}

// ============================================================================
// Stop Condition Checker
// ============================================================================

/**
 * Check if any stop condition is met
 */
export function checkStopConditions(
  conditions: StopCondition[] | undefined,
  partialResult: Partial<AgentResult>
): { shouldStop: boolean; reason?: string } {
  if (!conditions || conditions.length === 0) {
    return { shouldStop: false }
  }

  for (const condition of conditions) {
    switch (condition.type) {
      case 'token_limit': {
        const totalTokens =
          (partialResult.tokensUsed?.input ?? 0) +
          (partialResult.tokensUsed?.output ?? 0)
        if (typeof condition.value === 'number' && totalTokens >= condition.value) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Token limit ${condition.value} exceeded`,
          }
        }
        break
      }

      case 'time_limit': {
        if (
          typeof condition.value === 'number' &&
          (partialResult.durationMs ?? 0) >= condition.value
        ) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Time limit ${condition.value}ms exceeded`,
          }
        }
        break
      }

      case 'turn_limit': {
        if (
          typeof condition.value === 'number' &&
          (partialResult.turnsUsed ?? 0) >= condition.value
        ) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Turn limit ${condition.value} exceeded`,
          }
        }
        break
      }

      case 'pattern': {
        const pattern =
          condition.value instanceof RegExp
            ? condition.value
            : typeof condition.value === 'string'
              ? new RegExp(condition.value)
              : null
        if (pattern && partialResult.output && pattern.test(partialResult.output)) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Pattern matched: ${condition.value}`,
          }
        }
        break
      }

      case 'custom': {
        if (condition.fn && partialResult.output !== undefined) {
          const result: AgentResult = {
            output: partialResult.output ?? '',
            tokensUsed: partialResult.tokensUsed ?? { input: 0, output: 0 },
            turnsUsed: partialResult.turnsUsed ?? 0,
            stopReason: 'completed',
            durationMs: partialResult.durationMs ?? 0,
          }
          if (condition.fn(result)) {
            return {
              shouldStop: true,
              reason: condition.message ?? 'Custom stop condition met',
            }
          }
        }
        break
      }
    }
  }

  return { shouldStop: false }
}

// ============================================================================
// Output Parser
// ============================================================================

interface ParsedOutput {
  output: string
  structured?: any
  tokensUsed: { input: number; output: number }
  turnsUsed: number
}

/**
 * Parse Claude CLI output to extract result information
 */
export function parseClaudeOutput(
  stdout: string,
  outputFormat: ClaudeOutputFormat = 'text'
): ParsedOutput {
  const result: ParsedOutput = {
    output: stdout,
    tokensUsed: { input: 0, output: 0 },
    turnsUsed: 1,
  }

  // Try to parse JSON output
  if (outputFormat === 'json' || outputFormat === 'stream-json') {
    try {
      const parsed = JSON.parse(stdout)
      result.structured = parsed
      result.output = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)

      // Extract token usage if present
      if (parsed.usage) {
        result.tokensUsed = {
          input: parsed.usage.input_tokens ?? 0,
          output: parsed.usage.output_tokens ?? 0,
        }
      }

      // Extract turn count if present
      if (parsed.turns !== undefined) {
        result.turnsUsed = parsed.turns
      }
    } catch {
      // Not valid JSON, use as-is
    }
  }

  // Try to extract token usage from text output
  const tokenMatch = stdout.match(/tokens?:\s*(\d+)\s*input,?\s*(\d+)\s*output/i)
  if (tokenMatch) {
    result.tokensUsed = {
      input: parseInt(tokenMatch[1], 10),
      output: parseInt(tokenMatch[2], 10),
    }
  }

  // Try to extract turn count from text output
  const turnMatch = stdout.match(/turns?:\s*(\d+)/i)
  if (turnMatch) {
    result.turnsUsed = parseInt(turnMatch[1], 10)
  }

  return result
}

// ============================================================================
// CLI Executor
// ============================================================================

/**
 * Execute Claude CLI command and return structured result
 */
export async function executeClaudeCLI(options: CLIExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
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

        const { shouldStop, reason } = checkStopConditions(
          options.stopConditions,
          partialResult
        )

        if (shouldStop) {
          killed = true
          proc.kill()
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
      const reader = proc!.stderr.getReader()
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

    // Determine stop reason
    let stopReason: AgentResult['stopReason'] = 'completed'
    if (exitCode !== 0) {
      stopReason = 'error'
    }

    return {
      output: parsed.output,
      structured: parsed.structured,
      tokensUsed: parsed.tokensUsed,
      turnsUsed: parsed.turnsUsed,
      stopReason,
      durationMs,
      exitCode,
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
