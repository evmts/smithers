import type { AgentResult } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export interface ValidationOptions {
  validate: (result: AgentResult) => boolean | Promise<boolean>
  onInvalid?: (result: AgentResult) => void | Promise<void>
}

export function validationMiddleware(options: ValidationOptions): SmithersMiddleware {
  return {
    name: 'validation',
    wrapExecute: async (doExecute) => {
      const result = await doExecute()
      const isValid = await options.validate(result)
      if (!isValid) {
        if (options.onInvalid) {
          await options.onInvalid(result)
        }
        throw new ValidationError('Validation failed')
      }
      return result
    },
  }
}
