import type { RateLimitMonitor } from './monitor.js'
import type { ThrottleConfig, Provider } from './types.js'

export class ThrottleController {
  private monitor: RateLimitMonitor
  private config: ThrottleConfig
  private lastRequestTime: number

  constructor(monitor: RateLimitMonitor, config: Partial<ThrottleConfig> = {}) {
    this.monitor = monitor
    this.config = {
      targetUtilization: 0.8,
      minDelayMs: 0,
      maxDelayMs: 60_000,
      backoffStrategy: 'exponential',
      blockOnLimit: true,
      ...config,
    }
    this.lastRequestTime = 0
  }

  async acquire(provider: Provider, model: string): Promise<number> {
    const capacity = await this.monitor.getRemainingCapacity(provider, model)
    let delay = 0

    if (capacity.overall <= 0) {
      if (!this.config.blockOnLimit) {
        throw new Error(`Rate limit exceeded for ${provider}/${model}`)
      }
      const status = await this.monitor.getStatus(provider, model)
      const resetTime = Math.min(
        status.requests.resetsAt.getTime(),
        status.inputTokens.resetsAt.getTime(),
        status.outputTokens.resetsAt.getTime()
      )
      delay = Math.max(0, resetTime - Date.now())
    } else if (capacity.overall < (1 - this.config.targetUtilization)) {
      const utilizationRatio = 1 - capacity.overall
      const targetRatio = 1 - this.config.targetUtilization

      if (this.config.backoffStrategy === 'exponential') {
        const factor = Math.pow(utilizationRatio / targetRatio, 2)
        delay = this.config.minDelayMs + factor * (this.config.maxDelayMs - this.config.minDelayMs)
      } else {
        const factor = utilizationRatio / targetRatio
        delay = this.config.minDelayMs + factor * (this.config.maxDelayMs - this.config.minDelayMs)
      }
    }

    delay = Math.max(delay, this.config.minDelayMs)

    const timeSinceLastRequest = Date.now() - this.lastRequestTime
    if (timeSinceLastRequest < delay) {
      delay = delay - timeSinceLastRequest
    } else {
      delay = 0
    }

    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    this.lastRequestTime = Date.now()
    return delay
  }
}
