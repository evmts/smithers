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

      // Handle async App functions by awaiting them first
      const result = App()
      let element: JSX.Element

      if (result && typeof (result as any).then === 'function') {
        // App is async - await the promise to get the JSX
        element = await (result as Promise<JSX.Element>)
      } else {
        element = result as JSX.Element
      }

      // Wrap in a sync function for the renderer
      const AppWrapper = () => element

      // The renderer handles JSX.Element → SmithersNode conversion internally
      disposeFunction = render(AppWrapper as any, rootNode)

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
