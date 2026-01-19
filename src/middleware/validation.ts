import type { AgentResult } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export interface ValidationMiddlewareOptions {
  validate: (result: AgentResult) => boolean | Promise<boolean>
  errorMessage?: string
}

export function validationMiddleware(options: ValidationMiddlewareOptions): SmithersMiddleware {
  return {
    name: 'validation',
    transformResult: async (result: AgentResult) => {
      if (result.stopReason === 'error') {
        return result
      }

      const isValid = await options.validate(result)
      if (!isValid) {
        throw new ValidationError(options.errorMessage ?? 'Validation failed')
      }

      return result
    },
  }
}
