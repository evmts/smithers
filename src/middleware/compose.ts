import type { AgentResult } from '../components/agents/types.js'
import type { ClaudeExecutionParams, SmithersMiddleware } from './types.js'

function filterMiddleware(middlewares: (SmithersMiddleware | null | undefined)[]): SmithersMiddleware[] {
  return middlewares.filter(Boolean) as SmithersMiddleware[]
}

function buildProgressTransformer(
  middlewares: SmithersMiddleware[],
  onProgress: ClaudeExecutionParams['onProgress'],
): ClaudeExecutionParams['onProgress'] {
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

  return {
    name: active.map((mw) => mw.name).filter(Boolean).join('+') || undefined,
    transformParams: async ({ type, params }) => {
      let nextParams = params
      for (const mw of active) {
        if (mw.transformParams) {
          nextParams = await mw.transformParams({ type, params: nextParams })
        }
      }
      const onProgress = buildProgressTransformer(active, nextParams.onProgress)
      return onProgress ? { ...nextParams, onProgress } : nextParams
    },
    wrapExecute: async ({ doExecute, params }) => {
      let wrapped = doExecute
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const mw = active[i]
        if (!mw.wrapExecute) continue
        const previous = wrapped
        wrapped = () => mw.wrapExecute!({ doExecute: previous, params })
      }
      return wrapped()
    },
    transformChunk: active.some((mw) => mw.transformChunk)
      ? (chunk: string) => {
          let nextChunk = chunk
          for (const mw of active) {
            if (mw.transformChunk) {
              nextChunk = mw.transformChunk(nextChunk)
            }
          }
          return nextChunk
        }
      : undefined,
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
}

/**
 * Apply middleware to an execution function.
 */
export async function applyMiddleware(
  execute: () => Promise<AgentResult>,
  params: ClaudeExecutionParams,
  middlewares: (SmithersMiddleware | null | undefined)[],
): Promise<AgentResult> {
  const active = filterMiddleware(middlewares)
  if (active.length === 0) {
    return execute()
  }

  let nextParams = params
  for (const mw of active) {
    if (mw.transformParams) {
      nextParams = await mw.transformParams({ type: 'execute', params: nextParams })
    }
  }

  const onProgress = buildProgressTransformer(active, nextParams.onProgress)
  if (onProgress) {
    nextParams = { ...nextParams, onProgress }
  }

  let wrappedExecute = execute
  for (let i = active.length - 1; i >= 0; i -= 1) {
    const mw = active[i]
    if (!mw.wrapExecute) continue
    const previous = wrappedExecute
    wrappedExecute = () => mw.wrapExecute!({ doExecute: previous, params: nextParams })
  }

  let result = await wrappedExecute()
  for (const mw of active) {
    if (mw.transformResult) {
      result = await mw.transformResult(result)
    }
  }

  return result
}
