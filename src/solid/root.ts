import type { JSX } from 'solid-js'
import { render } from './renderer.js'
import type { SmithersNode } from '../core/types.js'
import { serialize } from '../core/serialize.js'

/**
 * Smithers root for mounting Solid components.
 */
export interface SmithersRoot {
  mount(App: () => JSX.Element): void
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
    mount(App: () => JSX.Element): void {
      if (disposeFunction) {
        disposeFunction()
        rootNode.children = []
      }
      disposeFunction = render(App, rootNode)
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
