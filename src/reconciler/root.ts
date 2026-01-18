import type { ReactNode } from 'react'
import { SmithersReconciler } from './host-config.js'
import type { SmithersNode } from './types.js'
import { serialize } from './serialize.js'
import { createOrchestrationPromise } from '../components/Ralph.jsx'

// Type for the fiber root container
type FiberRoot = ReturnType<typeof SmithersReconciler.createContainer>

/**
 * Smithers root for mounting React components.
 */
export interface SmithersRoot {
  /**
   * Mount the app and wait for orchestration to complete.
   * Returns a Promise that resolves when Ralph signals completion.
   */
  mount(App: () => ReactNode | Promise<ReactNode>): Promise<void>
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

  let fiberRoot: FiberRoot | null = null

  return {
    async mount(App: () => ReactNode | Promise<ReactNode>): Promise<void> {
      // Clean up previous render
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        rootNode.children = []
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
      // createContainer signature: (containerInfo, tag, hydrate, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, transitionCallbacks)
      fiberRoot = SmithersReconciler.createContainer(
        rootNode, // container
        0, // LegacyRoot tag (ConcurrentRoot = 1)
        null, // hydrationCallbacks
        false, // isStrictMode
        null, // concurrentUpdatesByDefaultOverride
        '', // identifierPrefix
        (error: Error) => console.error('Smithers recoverable error:', error), // onRecoverableError
        null // transitionCallbacks
      )

      // Render the app
      SmithersReconciler.updateContainer(element, fiberRoot, null, () => {})

      // Flush the initial render synchronously
      SmithersReconciler.flushSync(() => {})

      // Wait for orchestration to complete (Ralph will signal this)
      await completionPromise
    },

    getTree(): SmithersNode {
      return rootNode
    },

    dispose(): void {
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        fiberRoot = null
      }
      rootNode.children = []
    },

    toXML(): string {
      return serialize(rootNode)
    },
  }
}
