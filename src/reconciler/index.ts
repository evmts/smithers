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

// Export utility functions for forcing synchronous updates
export const flushSyncWork = () => {
  const fn = (reconciler as any).flushSyncWork
  if (fn) fn()
}

export const flushPassiveEffects = () => {
  const fn = (reconciler as any).flushPassiveEffects
  if (fn) fn()
}

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
    async render(element: ReactElement): Promise<PluNode> {
      // Try updateContainerSync first (React 19+)
      const updateContainerSync = (reconciler as any).updateContainerSync

      if (updateContainerSync) {
        // Use updateContainerSync for rendering
        // Note: Even though it's called "Sync", the commit phase is still async
        updateContainerSync(element, container)
      } else {
        // Fallback: use regular updateContainer
        reconciler.updateContainer(element, container, null, () => {})

        const flushSyncWork = (reconciler as any).flushSyncWork
        const flushPassiveEffects = (reconciler as any).flushPassiveEffects

        if (flushSyncWork) {
          flushSyncWork()
        }

        if (flushPassiveEffects) {
          flushPassiveEffects()
        }
      }

      // The React reconciler commits work asynchronously in microtasks/timers
      // We need to wait for the commit phase to complete
      // Try multiple strategies to ensure the work is done:

      // 1. Process immediate microtasks
      await new Promise((resolve) => setImmediate(resolve))

      // 2. Wait a bit more for async work (React 19 schedules work in timers)
      await new Promise((resolve) => setTimeout(resolve, 10))

      // 3. One final microtask to catch any stragglers
      await new Promise((resolve) => setImmediate(resolve))

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
