import { serialize } from './serialize.js'
import type { SmithersNode } from './types.js'

/**
 * Root interface for mounting Smithers applications.
 */
export interface SmithersRoot {
  /**
   * Mount a component tree.
   * The component function should return a SmithersNode (from jsx-runtime).
   */
  mount: (component: () => SmithersNode | any) => void

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
 * Type guard for SmithersNode
 */
function isSmithersNode(value: any): value is SmithersNode {
  return value && typeof value === 'object' && 'type' in value && 'props' in value && 'children' in value
}

/**
 * Create a Smithers root for mounting components.
 *
 * This is a synchronous version that works with the jsx-runtime which
 * directly creates SmithersNode trees. For async React rendering with
 * hooks, use createSmithersRoot from 'smithers/react'.
 */
export function createSmithersRoot(): SmithersRoot {
  // Create a ROOT node
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  return {
    mount(component: () => SmithersNode | any) {
      // Clear previous children
      rootNode.children = []

      // Call the component function to get the tree
      const result = component()

      // Add result to root if it's a SmithersNode
      if (isSmithersNode(result)) {
        result.parent = rootNode
        rootNode.children.push(result)
      } else if (Array.isArray(result)) {
        // Handle array of nodes (fragment)
        for (const child of result) {
          if (isSmithersNode(child)) {
            child.parent = rootNode
            rootNode.children.push(child)
          }
        }
      }
    },

    getTree() {
      return rootNode
    },

    toXML() {
      return serialize(rootNode)
    },

    dispose() {
      rootNode.children = []
    },
  }
}
