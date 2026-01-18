import type { SmithersMiddleware } from './types.js'

export interface CostTrackingOptions {
  onCost: (cost: { input: number; output: number; total: number }) => void
  pricing?: Record<string, { input: number; output: number }>
}

const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  sonnet: { input: 0.003, output: 0.015 },
  opus: { input: 0.015, output: 0.075 },
  haiku: { input: 0.00025, output: 0.00125 },
}

export function costTrackingMiddleware(options: CostTrackingOptions): SmithersMiddleware {
  return {
    name: 'cost-tracking',
    wrapExecute: async (doExecute, execOptions) => {
      const result = await doExecute()
      const modelId = execOptions.model ?? 'sonnet'
      const pricing = options.pricing?.[modelId] ?? DEFAULT_PRICING[modelId]

      if (!pricing || !result.tokensUsed) {
        return result
      }

      const inputCost = (result.tokensUsed.input / 1000) * pricing.input
      const outputCost = (result.tokensUsed.output / 1000) * pricing.output
      const total = inputCost + outputCost

      options.onCost({ input: inputCost, output: outputCost, total })
      return result
    },
  }
}
