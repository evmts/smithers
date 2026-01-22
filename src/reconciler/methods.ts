import type { SmithersNode } from './types.js'

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
    node.props['value'] = text
  },

  setProperty(node: SmithersNode, name: string, value: unknown): void {
    if (name === 'children') return
    if (name === '__smithersKey' || name === 'key') {
      node.key = value as string | number
      return
    }
    node.props[name] = value
  },

  insertNode(parent: SmithersNode, node: SmithersNode, anchor?: SmithersNode): void {
    const oldParent = node.parent
    if (oldParent) {
      const oldIdx = oldParent.children.indexOf(node)
      if (oldIdx !== -1) oldParent.children.splice(oldIdx, 1)
    }

    node.parent = parent

    const existingIdx = parent.children.indexOf(node)
    if (existingIdx !== -1) parent.children.splice(existingIdx, 1)

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
    if (idx !== -1) parent.children.splice(idx, 1)
    if (node.parent === parent) node.parent = null

    function clearDescendants(n: SmithersNode) {
      for (const child of n.children) {
        child.parent = null
        clearDescendants(child)
      }
    }
    clearDescendants(node)
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
