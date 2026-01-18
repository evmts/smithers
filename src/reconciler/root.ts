import type { ReactNode } from 'react'
import { SmithersReconciler } from './host-config.js'
import type { SmithersNode } from './types.js'
import { serialize } from './serialize.js'
import { createOrchestrationPromise } from '../components/Ralph.jsx'

// Type for the fiber root container
type FiberRoot = ReturnType<typeof SmithersReconciler.createContainer>

// Module-level reference to the current root for frame capture
let currentRootNode: SmithersNode | null = null

/**
 * Get the current tree serialized as XML.
 * Used by SmithersProvider to capture render frames.
 */
export function getCurrentTreeXML(): string | null {
  if (!currentRootNode) return null
  return serialize(currentRootNode)
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

  // Set module-level reference for frame capture
  currentRootNode = rootNode

  let fiberRoot: FiberRoot | null = null

  return {
    async mount(App: () => ReactNode | Promise<ReactNode>): Promise<void> {
      // Clean up previous render (synchronous in LegacyRoot mode)
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        // React calls clearContainer/removeNode to clean up children
      }

      // Create a promise that Ralph will resolve when orchestration completes
      const completionPromise = createOrchestrationPromise()

      // Check if App returns a Promise
      const result = App()

      let element: ReactNode

      if (result && typeof (result as any).then === 'function') {
        // App is async - we need to await the JSX first
        element = await (result as Promise<ReactNode>)
      } else {
        // App is sync
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
        (error: unknown) => console.error('Smithers uncaught error:', error), // onUncaughtError
        (error: unknown) => console.error('Smithers caught error:', error), // onCaughtError
        (error: unknown) => console.error('Smithers recoverable error:', error), // onRecoverableError
        null // transitionCallbacks
      )

      // Render the app synchronously
      // LegacyRoot mode (tag: 0) provides synchronous updates by default
      SmithersReconciler.updateContainer(element, fiberRoot, null, () => {})

      // Wait for orchestration to complete (Ralph will signal this)
      await completionPromise
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
      // Clear global singleton if this is the current root
      if (currentRootNode === rootNode) {
        currentRootNode = null
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
