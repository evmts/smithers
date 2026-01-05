import ReactReconciler from 'react-reconciler'
import type { ReactElement } from 'react'
import { hostConfig } from './host-config.js'
import type { PluNode, PluRoot } from '../core/types.js'

/**
 * Create the reconciler with our host config
 */
const reconciler = ReactReconciler(hostConfig as any)

// Inject into DevTools for debugging (optional but helpful)
reconciler.injectIntoDevTools({
  bundleType: 1, // 0 for PROD, 1 for DEV
  version: '0.1.0',
  rendererPackageName: 'plue',
})

/**
 * Create a Plue root for rendering React elements
 *
 * @example
 * ```tsx
 * const root = createPluRoot()
 * const tree = root.render(<MyAgent />)
 * const xml = serialize(tree)
 * ```
 */
export function createPluRoot(): PluRoot {
  // Create root container node
  const rootNode: PluNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  // Create reconciler container
  // Use legacy mode (tag 1) for synchronous rendering
  const container = reconciler.createContainer(
    rootNode,
    1, // tag (1 = legacy/sync mode, 0 = concurrent mode)
    null, // hydration callbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    '', // identifierPrefix
    (error: Error) => {
      console.error('[RECONCILER] onUncaughtError:', error)
    }, // onUncaughtError
    (error: Error) => {
      console.error('[RECONCILER] onCaughtError:', error)
    }, // onCaughtError
    (error: Error) => {
      console.error('[RECONCILER] onRecoverableError:', error)
    }, // onRecoverableError
    () => {}, // onDefaultTransitionIndicator
    null // transitionCallbacks
  )

  return {
    render(element: ReactElement): PluNode {
      // Update the container with the element synchronously
      const updateContainerSync = (reconciler as any).updateContainerSync
      if (updateContainerSync) {
        updateContainerSync(element, container, null, () => {})
      } else {
        reconciler.updateContainer(element, container, null, () => {})
      }

      // Force flush any pending work to ensure synchronous rendering
      const flushSyncWork = (reconciler as any).flushSyncWork
      if (flushSyncWork) {
        flushSyncWork()
      }

      return rootNode
    },

    unmount(): void {
      // Clear the container
      reconciler.updateContainer(null, container, null, () => {})
    },

    getTree(): PluNode | null {
      return rootNode
    },
  }
}
