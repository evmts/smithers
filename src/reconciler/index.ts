import ReactReconciler from 'react-reconciler'
import type { ReactElement } from 'react'
import { hostConfig } from './host-config.js'
import type { SmithersNode, SmithersRoot } from '../core/types.js'

/**
 * Create the reconciler with our host config
 */
const reconciler = ReactReconciler(hostConfig as any)

type VoidFn = () => void

const scheduleImmediate: (callback: VoidFn) => void =
  typeof setImmediate === 'function'
    ? setImmediate
    : (callback) => {
        setTimeout(callback, 0)
      }

// Inject into DevTools for debugging (optional but helpful)
reconciler.injectIntoDevTools({
  bundleType: 1, // 0 for PROD, 1 for DEV
  version: '0.1.0',
  rendererPackageName: 'smithers',
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

export const runWithSyncUpdates = (fn: VoidFn): void => {
  const flushSyncFromReconciler = (reconciler as any).flushSyncFromReconciler
  if (typeof flushSyncFromReconciler === 'function') {
    flushSyncFromReconciler(fn)
    return
  }

  const batchedUpdates = (reconciler as any).batchedUpdates
  if (typeof batchedUpdates === 'function') {
    batchedUpdates(fn)
    return
  }

  fn()
}

export const waitForCommit = async (): Promise<void> => {
  await new Promise<void>((resolve) => scheduleImmediate(resolve))
  await new Promise<void>((resolve) => setTimeout(resolve, 10))
  await new Promise<void>((resolve) => scheduleImmediate(resolve))
}

export const waitForStateUpdates = async (): Promise<void> => {
  await new Promise<void>((resolve) => scheduleImmediate(resolve))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/**
 * Create a Smithers root for rendering React elements
 *
 * @example
 * ```tsx
 * const root = createSmithersRoot()
 * const tree = root.render(<MyAgent />)
 * const xml = serialize(tree)
 * ```
 */
export function createSmithersRoot(): SmithersRoot {
  // Create root container node
  const rootNode: SmithersNode = {
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
    async render(element: ReactElement): Promise<SmithersNode> {
      // Try updateContainerSync first (React 19+)
      const updateContainerSync = (reconciler as any).updateContainerSync

      if (updateContainerSync) {
        // Use updateContainerSync for synchronous rendering
        updateContainerSync(element, container)
      } else {
        // Fallback: use regular updateContainer
        reconciler.updateContainer(element, container, null, () => {})
      }

      // Flush any synchronous work
      const flushSyncWork = (reconciler as any).flushSyncWork
      const flushPassiveEffects = (reconciler as any).flushPassiveEffects

      if (flushSyncWork) {
        try {
          flushSyncWork()
        } catch (e) {
          // Ignore flush errors
        }
      }

      if (flushPassiveEffects) {
        try {
          flushPassiveEffects()
        } catch (e) {
          // Ignore flush errors
        }
      }

      // Wait for React's async commit phase
      // React 19 schedules work asynchronously even with updateContainerSync
      await waitForCommit()

      return rootNode
    },

    unmount(): void {
      // Clear the container
      reconciler.updateContainer(null, container, null, () => {})
    },

    getTree(): SmithersNode | null {
      return rootNode
    },
  }
}
