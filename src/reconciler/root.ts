import type { ReactNode } from 'react'
import { SmithersReconciler } from './host-config.js'
import type { SmithersNode } from './types.js'
import { serialize } from './serialize.js'
import {
  createOrchestrationPromise,
  signalOrchestrationErrorByToken,
} from '../components/SmithersProvider.js'

// Type for the fiber root container
type FiberRoot = ReturnType<typeof SmithersReconciler.createContainer>

function isThenable(value: unknown): value is Promise<ReactNode> {
  return value !== null &&
         typeof value === 'object' &&
         typeof (value as { then?: unknown }).then === 'function'
}

/**
 * Smithers root for mounting React components.
 */
export interface SmithersRoot {
  /**
   * Mount the app and wait for orchestration to complete.
   * Returns a Promise that resolves when Ralph signals completion.
   */
  mount(App: () => ReactNode | Promise<ReactNode>): Promise<void>

  /**
   * Render and wait for initial commit to complete.
   * Useful for unit tests that don't use SmithersProvider/Ralph.
   */
  render(element: ReactNode): Promise<void>

  getTree(): SmithersNode
  dispose(): void
  /**
   * Serialize the tree to XML for display/approval.
   * This is crucial for showing users the agent plan before execution.
   */
  toXML(): string
}

// Optional legacy global frame capture (not concurrency-safe).
let globalFrameCaptureRoot: SmithersRoot | null = null

/**
 * Opt-in global frame capture for legacy callers (not concurrency-safe).
 */
export function setGlobalFrameCaptureRoot(root: SmithersRoot | null): void {
  globalFrameCaptureRoot = root
}

/**
 * Get the globally registered tree serialized as XML (not concurrency-safe).
 */
export function getCurrentTreeXML(): string | null {
  if (!globalFrameCaptureRoot) return null
  return globalFrameCaptureRoot.toXML()
}

/**
 * Create a Smithers root for rendering React components to SmithersNode trees.
 */
export function createSmithersRoot(): SmithersRoot {
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  let fiberRoot: FiberRoot | null = null

  return {
    async mount(App: () => ReactNode | Promise<ReactNode>): Promise<void> {
      // Clean up previous render (synchronous in LegacyRoot mode)
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        // React calls clearContainer/removeNode to clean up children
      }

      // Create a promise that Ralph will resolve when orchestration completes
      // Token-based API ensures concurrency safety across multiple roots
      const { promise: completionPromise, token: orchestrationToken } = createOrchestrationPromise()
      let fatalError: unknown | null = null
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

      // Check if App returns a Promise
      const result = App()

      let element: ReactNode

      if (isThenable(result)) {
        element = await result
      } else {
        element = result as ReactNode
      }

      // Create the fiber root container
      // createContainer(containerInfo, tag, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, transitionCallbacks)
      // NOTE: @types/react-reconciler 0.32 has 8 params, but runtime 0.33 has 10
      fiberRoot = (SmithersReconciler.createContainer as any)(
        rootNode, // containerInfo
        0, // tag: LegacyRoot (ConcurrentRoot = 1)
        null, // hydrationCallbacks
        false, // isStrictMode
        null, // concurrentUpdatesByDefaultOverride
        '', // identifierPrefix
        handleFatalError, // onUncaughtError
        handleFatalError, // onCaughtError
        (error: unknown) => console.error('Smithers recoverable error:', error), // onRecoverableError
        null // transitionCallbacks
      )

      // Render the app synchronously
      // LegacyRoot mode (tag: 0) provides synchronous updates by default
      SmithersReconciler.updateContainer(element, fiberRoot, null, () => {})

      // Wait for orchestration to complete or a fatal error to surface
      await Promise.race([completionPromise.catch(() => {}), errorPromise])
      if (fatalError) {
        throw fatalError
      }
    },

    render(element: ReactNode): Promise<void> {
      return new Promise((resolve) => {
        // Create fiber root if needed
        if (!fiberRoot) {
          fiberRoot = (SmithersReconciler.createContainer as any)(
            rootNode, // containerInfo
            0, // tag: LegacyRoot (ConcurrentRoot = 1)
            null, // hydrationCallbacks
            false, // isStrictMode
            null, // concurrentUpdatesByDefaultOverride
            '', // identifierPrefix
            (error: unknown) => console.error('Smithers uncaught error:', error),
            (error: unknown) => console.error('Smithers caught error:', error),
            (error: unknown) => console.error('Smithers recoverable error:', error),
            null // transitionCallbacks
          )
        }

        // Update container with element (or null to unmount)
        // The callback is invoked when React has finished committing the update
        // LegacyRoot mode (tag: 0) provides synchronous updates by default
        SmithersReconciler.updateContainer(element, fiberRoot, null, () => {
          resolve()
        })
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
      // Defensive cleanup: recursively clear all parent pointers and empty children array
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
