/**
 * Solid.js universal renderer (JS version for Vite)
 */

import { createRenderer } from 'solid-js/universal'

// Create the renderer instance
const smithersRenderer = createRenderer({
  createElement(type) {
    return {
      type,
      props: {},
      children: [],
      parent: null,
    }
  },

  createTextNode(text) {
    return {
      type: 'TEXT',
      props: { value: text },
      children: [],
      parent: null,
    }
  },

  replaceText(node, text) {
    node.props.value = text
  },

  setProperty(node, name, value) {
    if (name !== 'children') {
      node.props[name] = value
    }
  },

  insertNode(parent, child, anchor) {
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

  removeNode(parent, child) {
    const idx = parent.children.indexOf(child)
    if (idx >= 0) {
      parent.children.splice(idx, 1)
    }
    child.parent = null
  },

  isTextNode(node) {
    return node.type === 'TEXT'
  },

  getParentNode(node) {
    return node.parent ?? undefined
  },

  getFirstChild(node) {
    return node.children[0]
  },

  getNextSibling(node) {
    if (!node.parent) return undefined
    const idx = node.parent.children.indexOf(node)
    if (idx === -1) return undefined
    return node.parent.children[idx + 1]
  },
})

// Export ALL functions individually (named exports)
export const render = smithersRenderer.render
export const effect = smithersRenderer.effect
export const memo = smithersRenderer.memo
export const createComponent = smithersRenderer.createComponent
export const createElement = smithersRenderer.createElement
export const createTextNode = smithersRenderer.createTextNode
export const insertNode = smithersRenderer.insertNode
export const insert = smithersRenderer.insert
export const spread = smithersRenderer.spread
export const setProp = smithersRenderer.setProp
export const mergeProps = smithersRenderer.mergeProps
export const use = smithersRenderer.use
