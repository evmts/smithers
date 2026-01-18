import type { CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export interface TimeoutOptions {
  baseTimeout?: number
  modelMultipliers?: Record<string, number>
  promptLengthFactor?: number
}

export function timeoutMiddleware(options: TimeoutOptions): SmithersMiddleware {
  const baseTimeout = options.baseTimeout ?? 300000
  const modelMultipliers = options.modelMultipliers ?? {
    opus: 1.5,
    sonnet: 1.0,
    haiku: 0.5,
  }
  const lengthFactor = options.promptLengthFactor ?? 0

  return {
    name: 'timeout-adjustment',
    transformOptions: (opts: CLIExecutionOptions) => {
      if (opts.timeout !== undefined) {
        return opts
      }

      const model = opts.model ?? 'sonnet'
      const multiplier = modelMultipliers[model] ?? 1.0
      const promptLength = opts.prompt?.length ?? 0
      const adjustedTimeout = baseTimeout * multiplier + (promptLength * lengthFactor)

      return {
        ...opts,
        timeout: adjustedTimeout,
      }
    },
  }
}
