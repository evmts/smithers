import type { JSX } from 'solid-js'
import { createRoot } from './solid-shim.js'
import { render } from './renderer.js'
import type { SmithersNode } from './types.js'

/**
 * Smithers root for mounting Solid components.
 */
export interface SmithersRoot {
  mount(App: () => JSX.Element): void
  getTree(): SmithersNode
  flush(): Promise<void>
  dispose(): void
}

/**
 * Create a Smithers root for rendering Solid components to SmithersNode trees.
 *
 * @example
 * ```tsx
 * const root = createSmithersRoot()
 * root.mount(() => <Claude>Hello</Claude>)
 * const tree = root.getTree()
 * root.dispose()
 * ```
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
      // render() already creates a reactive owner context
      // Cast is safe because render handles JSX.Element -> SmithersNode conversion
      disposeFunction = render(App as any, rootNode)
    },

    getTree(): SmithersNode {
      return rootNode
    },

    async flush(): Promise<void> {
      // Drain microtasks
      await Promise.resolve()
      // Additional safety margin for scheduled effects
      await new Promise(resolve => setTimeout(resolve, 0))
    },

    dispose(): void {
      if (disposeFunction) {
        disposeFunction()
        disposeFunction = null
      }
      rootNode.children = []
    },
  }
}
