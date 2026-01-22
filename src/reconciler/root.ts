import type { ReactNode } from 'react'
import { SmithersReconciler } from './host-config.js'
import type { SmithersNode } from './types.js'
import { serialize } from './serialize.js'
import {
  createOrchestrationPromise,
  signalOrchestrationErrorByToken,
} from '../components/SmithersProvider.js'

type FiberRoot = ReturnType<typeof SmithersReconciler.createContainer>

function isThenable(value: unknown): value is Promise<ReactNode> {
  return value !== null &&
         typeof value === 'object' &&
         typeof (value as { then?: unknown }).then === 'function'
}

export interface SmithersRoot {
  mount(App: () => ReactNode | Promise<ReactNode>): Promise<void>
  render(element: ReactNode): Promise<void>
  getTree(): SmithersNode
  dispose(): void
  toXML(): string
}

let globalFrameCaptureRoot: SmithersRoot | null = null

export function setGlobalFrameCaptureRoot(root: SmithersRoot | null): void {
  globalFrameCaptureRoot = root
}

export function getCurrentTreeXML(): string | null {
  if (!globalFrameCaptureRoot) return null
  return globalFrameCaptureRoot.toXML()
}

export function createSmithersRoot(): SmithersRoot {
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  let fiberRoot: FiberRoot | null = null
  let renderState: { resolve: () => void; reject: (error: Error) => void; settled: boolean } | null = null

  const rejectRender = (error: unknown) => {
    if (!renderState || renderState.settled) return
    renderState.settled = true
    const err = error instanceof Error ? error : new Error(String(error))
    renderState.reject(err)
    renderState = null
  }

  const handleRenderError = (label: string) => (error: unknown) => {
    console.error(label, error)
    rejectRender(error)
  }

  const createFiberRoot = (
    onUncaughtError: (error: unknown) => void,
    onCaughtError: (error: unknown) => void
  ): FiberRoot => {
    return (SmithersReconciler.createContainer as any)(
      rootNode,
      0,
      null,
      false,
      null,
      '',
      onUncaughtError,
      onCaughtError,
      (error: unknown) => console.error('Smithers recoverable error:', error),
      null
    )
  }

  return {
    async mount(App: () => ReactNode | Promise<ReactNode>): Promise<void> {
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
      }

      const { promise: completionPromise, token: orchestrationToken } = createOrchestrationPromise()
      let fatalError: unknown | null = null
      let completionError: unknown | null = null
      let errorResolve: (() => void) | null = null
      const errorPromise = new Promise<void>((resolve) => {
        errorResolve = resolve
      })
      const handleFatalError = (error: unknown) => {
        fatalError = error
        if (errorResolve) errorResolve()
        const err = error instanceof Error ? error : new Error(String(error))
        signalOrchestrationErrorByToken(orchestrationToken, err)
      }

      let element: ReactNode
      try {
        const result = App()
        if (isThenable(result)) {
          element = await result
        } else {
          element = result as ReactNode
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        handleFatalError(err)
        void completionPromise.catch((err) => console.debug('Completion promise rejected:', err))
        return Promise.reject(new Error('Render failed', { cause: err }))
      }

      fiberRoot = createFiberRoot(handleFatalError, handleFatalError)

      SmithersReconciler.updateContainer(element, fiberRoot, null, () => {})

      // Wait for orchestration to complete or a fatal error to surface
      await Promise.race([
        completionPromise.catch((err) => {
          completionError = err
        }),
        errorPromise,
      ])
      if (fatalError) {
        throw fatalError
      }
      if (completionError) {
        throw completionError
      }
    },

    render(element: ReactNode): Promise<void> {
      return new Promise((resolve, reject) => {
        renderState = { resolve, reject, settled: false }
        const finalize = () => {
          if (!renderState || renderState.settled) return
          renderState.settled = true
          renderState.resolve()
          renderState = null
        }

        if (!fiberRoot) {
          fiberRoot = createFiberRoot(
            handleRenderError('Smithers uncaught error:'),
            handleRenderError('Smithers caught error:')
          )
        }

        try {
          SmithersReconciler.updateContainer(element, fiberRoot, null, () => {
            finalize()
          })
        } catch (error) {
          handleRenderError('Smithers render error:')(error)
        }
      })
    },

    getTree(): SmithersNode {
      return rootNode
    },

    dispose(): void {
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        fiberRoot = null
      }
      function clearTree(node: SmithersNode) {
        for (const child of node.children) {
          child.parent = null
          clearTree(child)
        }
        node.children.length = 0
      }
      clearTree(rootNode)
    },

    toXML(): string {
      return serialize(rootNode)
    },
  }
}
