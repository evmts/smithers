import { render } from '../solid/renderer.js'
import { serialize } from './serialize.js'
import type { SmithersNode } from './types.js'
import type { JSX } from 'solid-js'

/**
 * Root interface for mounting Smithers applications.
 */
export interface SmithersRoot {
  /**
   * Mount a component tree.
   */
  mount: (component: () => JSX.Element) => void

  /**
   * Get the current SmithersNode tree.
   */
  getTree: () => SmithersNode

  /**
   * Serialize the tree to XML.
   */
  toXML: () => string

  /**
   * Dispose of the root and cleanup.
   */
  dispose: () => void
}

/**
 * Create a Smithers root for mounting components.
 */
export function createSmithersRoot(): SmithersRoot {
  // Create a ROOT node
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  let disposeFunction: (() => void) | null = null

  return {
    mount(component: () => JSX.Element) {
      // Clean up any previous render
      if (disposeFunction) {
        disposeFunction()
      }

      // Render the component into the root node
      disposeFunction = render(component, rootNode)
    },

    getTree() {
      return rootNode
    },

    toXML() {
      return serialize(rootNode)
    },

    dispose() {
      if (disposeFunction) {
        disposeFunction()
        disposeFunction = null
      }
      rootNode.children = []
    },
  }
}
