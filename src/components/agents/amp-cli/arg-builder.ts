// Amp CLI argument builder
// Builds command-line arguments for the amp CLI

import type { AmpCLIExecutionOptions, AmpMode } from '../types/amp.js'

/**
 * Mode mapping for Amp CLI
 */
export const modeMap: Record<AmpMode, string> = {
  smart: 'smart',
  rush: 'rush',
}

/**
 * Build command-line arguments for amp CLI execution
 */
export function buildAmpArgs(options: AmpCLIExecutionOptions): string[] {
  const args: string[] = []

  // Thread continuation takes a different command path
  if (options.continue || options.resume) {
    args.push('threads', 'continue')
    if (options.resume) {
      // Resume specific thread by ID (positional)
      args.push(options.resume)
    } else {
      // Continue last thread without interactive picker
      args.push('--last')
    }
    args.push('--execute')
  } else {
    // Standard execute mode
    args.push('--execute')
  }

  // Always use stream-json for structured output
  args.push('--stream-json')

  // Mode selection
  if (options.mode) {
    args.push('--mode', modeMap[options.mode] ?? options.mode)
  }

  // Permission mode
  if (options.permissionMode === 'bypassPermissions') {
    args.push('--dangerously-allow-all')
  }

  // Labels (can be specified multiple times)
  if (options.labels && options.labels.length > 0) {
    for (const label of options.labels) {
      args.push('--label', label)
    }
  }

  return args
}

/**
 * Build environment variables for amp CLI execution
 */
export function buildAmpEnv(_options: AmpCLIExecutionOptions): Record<string, string> {
  const env: Record<string, string> = {}

  // AMP_API_KEY should be inherited from process.env if set
  // No explicit env manipulation needed for standard usage

  return env
}
