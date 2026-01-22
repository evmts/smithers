import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'

function filterMiddleware(middlewares: (SmithersMiddleware | null | undefined)[]): SmithersMiddleware[] {
  return middlewares.filter(Boolean) as SmithersMiddleware[]
}

function buildProgressTransformer(
  middlewares: SmithersMiddleware[],
  onProgress: CLIExecutionOptions['onProgress'],
): CLIExecutionOptions['onProgress'] {
  if (!onProgress) return undefined

  const transformers = middlewares.map((mw) => mw.transformChunk).filter(Boolean) as Array<
    (chunk: string) => string
  >

  if (transformers.length === 0) return onProgress

  return (chunk: string) => {
    let nextChunk = chunk
    for (const transform of transformers) {
      nextChunk = transform(nextChunk)
    }
    onProgress(nextChunk)
  }
}

/**
 * Compose multiple middleware into a single middleware.
 */
export function composeMiddleware(...middlewares: (SmithersMiddleware | null | undefined)[]): SmithersMiddleware {
  const active = filterMiddleware(middlewares)

  if (active.length === 0) {
    return {}
  }

  const name = active.map((mw) => mw.name).filter(Boolean).join('+')

  const composed: SmithersMiddleware = {
    transformOptions: async (options) => {
      let nextOptions = options
      for (const mw of active) {
        if (mw.transformOptions) {
          nextOptions = await mw.transformOptions(nextOptions)
        }
      }
      const onProgress = buildProgressTransformer(active, nextOptions.onProgress)
      return onProgress ? { ...nextOptions, onProgress } : nextOptions
    },
    wrapExecute: async ({ doExecute, options }) => {
      let wrapped = doExecute
      for (const mw of [...active].reverse()) {
        if (!mw.wrapExecute) continue
        const previous = wrapped
        wrapped = () => mw.wrapExecute!({ doExecute: previous, options })
      }
      return wrapped()
    },
    transformResult: async (result: AgentResult) => {
      let nextResult = result
      for (const mw of active) {
        if (mw.transformResult) {
          nextResult = await mw.transformResult(nextResult)
        }
      }
      return nextResult
    },
  }

  if (active.some((mw) => mw.transformChunk)) {
    composed.transformChunk = (chunk: string) => {
      let nextChunk = chunk
      for (const mw of active) {
        if (mw.transformChunk) {
          nextChunk = mw.transformChunk(nextChunk)
        }
      }
      return nextChunk
    }
  }

  if (name) {
    composed.name = name
  }

  return composed
}
