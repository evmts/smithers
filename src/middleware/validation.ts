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

/**
 * Middleware that validates agent results against a custom predicate.
 *
 * @throws {ValidationError} When validation fails (result doesn't pass validate predicate)
 */
export function validationMiddleware(options: ValidationMiddlewareOptions): SmithersMiddleware {
  return {
    name: 'validation',
    // Use wrapExecute instead of transformResult so validation errors
    // can be caught by retry middleware (which also uses wrapExecute)
    wrapExecute: async ({ doExecute }) => {
      const result = await doExecute()

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
