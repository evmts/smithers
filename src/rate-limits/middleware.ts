import type { SmithersMiddleware } from '../middleware/types.js'
import type { RateLimitMonitor } from './monitor.js'
import type { ThrottleConfig, Provider } from './types.js'
import { ThrottleController } from './throttle.js'

export interface RateLimitMiddlewareOptions {
  monitor: RateLimitMonitor
  throttle?: Partial<ThrottleConfig>
  modelToProvider?: (model: string) => Provider
}

export function rateLimitingMiddleware(options: RateLimitMiddlewareOptions): SmithersMiddleware {
  const controller = new ThrottleController(options.monitor, options.throttle)
  const getProvider = options.modelToProvider ?? (() => 'anthropic' as Provider)

  return {
    name: 'rate-limiting',
    wrapExecute: async (doExecute, execOptions) => {
      const model = execOptions.model ?? 'sonnet'
      const provider = getProvider(model)
      const delayMs = await controller.acquire(provider, model)
      if (delayMs > 0) {
        console.log(`[rate-limit] Delayed ${delayMs}ms for ${provider}/${model}`)
      }
      return doExecute()
    },
  }
}
