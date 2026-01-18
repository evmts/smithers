import type { SmithersNode } from './types.js'

/**
 * Renderer configuration methods.
 * Exported separately for direct testing without JSX.
 * This file has NO React dependencies - it's framework-agnostic.
 */
export const rendererMethods = {
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
    if (name === 'children') {
      // Children are handled by insertNode, not setProperty
      return
    }
    if (name === 'key') {
      // Key is stored on the node itself for the Ralph Wiggum loop
      node.key = value as string | number
      return
    }
    // All other props go into props object
    node.props[name] = value
  },

  insertNode(parent: SmithersNode, node: SmithersNode, anchor?: SmithersNode): void {
    node.parent = parent
    if (anchor) {
      const idx = parent.children.indexOf(anchor)
      if (idx !== -1) {
        parent.children.splice(idx, 0, node)
        return
      }
    }
    parent.children.push(node)
  },

  removeNode(parent: SmithersNode, node: SmithersNode): void {
    const idx = parent.children.indexOf(node)
    if (idx >= 0) {
      parent.children.splice(idx, 1)
    }
    node.parent = null
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
}

export type { SmithersNode }
