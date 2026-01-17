/**
 * Solid.js universal renderer
 */

import type { SmithersNode } from './types.js'
import { createRenderer } from 'solid-js/universal'

/**
 * Solid.js universal renderer for building SmithersNode trees.
 * Converts JSX → SmithersNode tree using Solid's fine-grained reactivity.
 */
export function createSmithersRenderer() {
  return createRenderer<SmithersNode>({
    createElement(type: string): SmithersNode {
      return {
        type,
        props: {},
        children: [],
        parent: null,
      }
    },

    createTextNode(text: string): SmithersNode {
      return {
        type: 'TEXT',
        props: { value: text },
        children: [],
        parent: null,
      }
    },

    replaceText(node: SmithersNode, text: string): void {
      node.props.value = text
    },

    setProperty(node: SmithersNode, name: string, value: unknown): void {
      if (name !== 'children') {
        node.props[name] = value
      }
    },

    insertNode(parent: SmithersNode, child: SmithersNode, anchor?: SmithersNode): void {
      child.parent = parent
      if (anchor) {
        const idx = parent.children.indexOf(anchor)
        if (idx !== -1) {
          parent.children.splice(idx, 0, child)
          return
        }
      }
      parent.children.push(child)
    },

    removeNode(parent: SmithersNode, child: SmithersNode): void {
      const idx = parent.children.indexOf(child)
      if (idx >= 0) {
        parent.children.splice(idx, 1)
      }
      child.parent = null
    },

    isTextNode(node: SmithersNode): boolean {
      return node.type === 'TEXT'
    },

    getParentNode(node: SmithersNode): SmithersNode | undefined {
      return node.parent ?? undefined
    },

    getFirstChild(node: SmithersNode): SmithersNode | undefined {
      return node.children[0]
    },

    getNextSibling(node: SmithersNode): SmithersNode | undefined {
      if (!node.parent) return undefined
      const idx = node.parent.children.indexOf(node)
      if (idx === -1) return undefined
      return node.parent.children[idx + 1]
    },
  })
}

// Create the renderer instance
const smithersRenderer = createSmithersRenderer()

// Export ALL functions that compiled JSX will need
export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
} = smithersRenderer
