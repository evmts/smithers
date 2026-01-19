import type { SmithersMiddleware } from './types.js'

export interface TimeoutMiddlewareOptions {
  baseTimeout?: number
  modelMultipliers?: Record<string, number>
  promptLengthFactor?: number
}

export function timeoutMiddleware(options: TimeoutMiddlewareOptions): SmithersMiddleware {
  const baseTimeout = options.baseTimeout ?? 300000
  const modelMultipliers = options.modelMultipliers ?? {
    opus: 1.5,
    sonnet: 1.0,
    haiku: 0.5,
  }
  const promptLengthFactor = options.promptLengthFactor ?? 0

  return {
    name: 'timeout-adjustment',
    transformOptions: (executionOptions) => {
      if (executionOptions.timeout !== undefined) {
        return executionOptions
      }

      const modelId = executionOptions.model ?? 'sonnet'
      const multiplier = modelMultipliers[modelId] ?? 1.0
      const promptLength = executionOptions.prompt?.length ?? 0
      const adjustedTimeout = baseTimeout * multiplier + (promptLength * promptLengthFactor)

      return {
        ...executionOptions,
        timeout: adjustedTimeout,
      }
    },
  }
}
