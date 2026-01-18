import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import { composeMiddleware } from './compose.js'
import type { SmithersMiddleware } from './types.js'

/**
 * Apply middleware to a CLI execution.
 * Internal function used by Claude component.
 */
export async function applyMiddleware(
  execute: () => Promise<AgentResult>,
  options: CLIExecutionOptions,
  middlewares: SmithersMiddleware[],
): Promise<AgentResult> {
  const composed = composeMiddleware(...middlewares)

  let resolvedOptions = options
  if (composed.transformOptions) {
    resolvedOptions = await composed.transformOptions(options)
    if (resolvedOptions !== options) {
      Object.assign(options, resolvedOptions)
    }
  }

  const wrappedExecute = composed.wrapExecute
    ? () => composed.wrapExecute!(execute, resolvedOptions)
    : execute

  const result = await wrappedExecute()

  if (composed.transformResult) {
    return composed.transformResult(result)
  }

  return result
}
