import type { JSX } from 'solid-js'
import { createSmithersSolidRenderer } from './renderer.js'
import { ensureDocumentShim } from './dom-shim.js'

/**
 * Internal node representation for the Smithers renderer
 */
interface SmithersNode {
  type: string
  props: Record<string, unknown>
  children: SmithersNode[]
  parent: SmithersNode | null
  _execution?: {
    status: 'pending' | 'running' | 'complete' | 'error'
    result?: unknown
    error?: Error
    contentHash?: string
  }
}

/**
 * SmithersRoot interface for Solid renderer
 *
 * Unlike the React version which re-renders from scratch on each state change,
 * Solid renders once and uses fine-grained reactivity (signals) to update
 * specific parts of the tree. The root maintains a reference to the rendered tree.
 */
interface SmithersRoot {
  /**
   * Mount a Solid component tree
   * @param App - A function that returns JSX (Solid component)
   */
  mount(App: () => JSX.Element): void

  /**
   * Get the current tree state
   * @returns The root SmithersNode containing the rendered tree
   */
  getTree(): SmithersNode

  /**
   * Flush pending updates by draining microtasks
   *
   * Solid updates are synchronous via signals, but callbacks may schedule
   * microtasks that need to complete before reading the tree.
   *
   * @returns Promise that resolves when all pending updates are flushed
   */
  flush(): Promise<void>

  /**
   * Dispose of the render and clean up
   *
   * This should be called when the root is no longer needed to prevent
   * memory leaks and clean up any reactive subscriptions.
   */
  dispose(): void
}

/**
 * Create a Smithers root for rendering Solid components
 *
 * Unlike React which re-renders from scratch, Solid renders once and updates
 * via signals. The root maintains a reference to the rendered tree.
 *
 * @example
 * ```tsx
 * import { createSmithersSolidRoot } from '@evmts/smithers-solid'
 *
 * const root = createSmithersSolidRoot()
 *
 * function MyAgent() {
 *   return (
 *     <Claude>
 *       Write a haiku about programming
 *     </Claude>
 *   )
 * }
 *
 * root.mount(MyAgent)
 * const tree = root.getTree()
 *
 * // Clean up when done
 * root.dispose()
 * ```
 */
export function createSmithersSolidRoot(): SmithersRoot {
  // Create root container node
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  ensureDocumentShim()
  const { render } = createSmithersSolidRenderer()
  let disposeFunction: (() => void) | null = null

  return {
    /**
     * Mount a Solid component tree
     * @param App - A function that returns JSX (Solid component)
     */
    mount(App: () => JSX.Element): void {
      // Clean up previous render if any
      if (disposeFunction) {
        disposeFunction()
        rootNode.children = []
      }

      // Render the component - Solid's render returns a dispose function
      disposeFunction = render(App, rootNode)
    },

    /**
     * Get the current tree state
     * @returns The root SmithersNode containing the rendered tree
     */
    getTree(): SmithersNode {
      return rootNode
    },

    /**
     * Flush pending updates by draining microtasks
     *
     * Solid updates are synchronous via signals, but callbacks may schedule
     * microtasks that need to complete before reading the tree.
     *
     * @returns Promise that resolves when all pending updates are flushed
     */
    async flush(): Promise<void> {
      // Drain microtasks
      await Promise.resolve()
      // Additional safety margin for any scheduled effects
      await new Promise(resolve => setTimeout(resolve, 0))
    },

    /**
     * Dispose of the render and clean up
     *
     * This should be called when the root is no longer needed to prevent
     * memory leaks and clean up any reactive subscriptions.
     */
    dispose(): void {
      if (disposeFunction) {
        disposeFunction()
        disposeFunction = null
      }
      rootNode.children = []
    },
  }
}
