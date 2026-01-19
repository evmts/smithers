import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

/**
 * Compose multiple middleware into one.
 * Middleware are applied in order:
 * - transformOptions: left to right
 * - wrapExecute: right to left (outermost last)
 * - transformChunk: left to right
 * - transformResult: left to right
 */
export function composeMiddleware(
  ...middlewares: SmithersMiddleware[]
): SmithersMiddleware {
  const stack = middlewares.filter(Boolean)

  return {
    name: stack.map((mw) => mw.name).filter(Boolean).join(' -> ') || 'composed',
    transformOptions: async (options: CLIExecutionOptions) => {
      let nextOptions = options
      for (const middleware of stack) {
        if (middleware.transformOptions) {
          nextOptions = await middleware.transformOptions(nextOptions)
        }
      }
      return nextOptions
    },
    wrapExecute: async (doExecute: () => Promise<AgentResult>, options: CLIExecutionOptions) => {
      let composed = doExecute
      for (const middleware of [...stack].reverse()) {
        if (!middleware.wrapExecute) continue
        const next = composed
        composed = () => middleware.wrapExecute!(next, options)
      }
      return composed()
    },
    transformChunk: (chunk: string) => {
      let nextChunk = chunk
      for (const middleware of stack) {
        if (middleware.transformChunk) {
          nextChunk = middleware.transformChunk(nextChunk)
        }
      }
      return nextChunk
    },
    transformResult: async (result: AgentResult) => {
      let nextResult = result
      for (const middleware of stack) {
        if (middleware.transformResult) {
          nextResult = await middleware.transformResult(nextResult)
        }
      }
      return nextResult
    },
  }
}
