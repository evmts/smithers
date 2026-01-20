// Claude CLI Argument Builder
// Builds CLI arguments from execution options

import type { CLIExecutionOptions, ClaudePermissionMode, ClaudeOutputFormat } from '../types.js'

/**
 * Model name mapping from shorthand to full model ID
 * Uses latest dated versions for API compatibility
 */
export const modelMap: Record<string, string> = {
  opus: 'claude-opus-4-20250514',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
}

/**
 * Build permission arguments based on mode
 */
function buildPermissionArgs(mode?: ClaudePermissionMode): string[] {
  if (!mode || mode === 'default') return []
  if (mode === 'bypassPermissions') return ['--dangerously-skip-permissions']
  return ['--permission-mode', mode]
}

/**
 * Output format mapping
 */
export const formatMap: Record<ClaudeOutputFormat, string> = {
  text: 'text',
  json: 'json',
  'stream-json': 'stream-json',
}

/**
 * Build Claude CLI arguments from options
 */
export function buildClaudeArgs(options: CLIExecutionOptions): string[] {
  const args: string[] = []

  // Print mode for non-interactive execution
  args.push('--print')

  // Model
  if (options.model) {
    const modelId = modelMap[options.model] || options.model
    args.push('--model', modelId)
  }

  // Max turns
  if (options.maxTurns !== undefined) {
    args.push('--max-turns', String(options.maxTurns))
  }

  // Validate continue/resume mutual exclusivity
  if (options.continue && options.resume) {
    throw new Error('Cannot specify both continue and resume options')
  }

  // Permission mode
  args.push(...buildPermissionArgs(options.permissionMode))

  // System prompt
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt)
  }

  // Output format
  if (options.outputFormat) {
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
