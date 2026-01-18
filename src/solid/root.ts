import type { JSX } from 'solid-js'
import { render } from './renderer.js'
import type { SmithersNode } from '../core/types.js'
import { serialize } from '../core/serialize.js'
import { createOrchestrationPromise } from '../components/Ralph.jsx'

/**
 * Smithers root for mounting Solid components.
 */
export interface SmithersRoot {
  /**
   * Mount the app and wait for orchestration to complete.
   * Returns a Promise that resolves when Ralph signals completion.
   */
  mount(App: () => JSX.Element | Promise<JSX.Element>): Promise<void>
  getTree(): SmithersNode
  dispose(): void
  /**
   * Serialize the tree to XML for display/approval.
   * This is crucial for showing users the agent plan before execution.
   */
  toXML(): string
}

/**
 * Create a Smithers root for rendering Solid components to SmithersNode trees.
 */
export function createSmithersRoot(): SmithersRoot {
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  let disposeFunction: (() => void) | null = null

  return {
    async mount(App: () => JSX.Element | Promise<JSX.Element>): Promise<void> {
      if (disposeFunction) {
        disposeFunction()
        rootNode.children = []
      }

      // Create a promise that Ralph will resolve when orchestration completes
      const completionPromise = createOrchestrationPromise()

      // Check if App returns a Promise
      const result = App()

      if (result && typeof (result as any).then === 'function') {
        // App is async - we need to await the JSX first, then create a wrapper
        // that renders it. Use a signal to trigger re-render when ready.
        const jsxElement = await (result as Promise<JSX.Element>)

        // Create a simple wrapper component that just returns the awaited element
        // We use Object.assign to avoid Solid treating this as the same element
        const AppSync = () => {
          // Return the JSX element - Solid will handle the rendering
          return jsxElement
        }

        disposeFunction = render(AppSync as any, rootNode)
      } else {
        // App is sync - render directly
        disposeFunction = render(App as any, rootNode)
      }

      // Wait for orchestration to complete (Ralph will signal this)
      await completionPromise
    },

    getTree(): SmithersNode {
      return rootNode
    },

    dispose(): void {
      if (disposeFunction) {
        disposeFunction()
        disposeFunction = null
      }
      rootNode.children = []
    },

    toXML(): string {
      return serialize(rootNode)
    },
  }
}
