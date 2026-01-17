/**
 * JavaScript version of the Smithers renderer for Vite build-time imports.
 *
 * This .js file is necessary because vite-plugin-solid imports the renderer
 * during the build/transpilation phase, before TypeScript compilation happens.
 *
 * IMPORTANT: vite-plugin-solid expects to import individual functions directly,
 * not the result of createRenderer(). We export both for compatibility.
 */

import { createRenderer } from 'solid-js/universal'

// Individual renderer methods - exported directly for vite-plugin-solid
export function createElement(type) {
  return {
    type,
    props: {},
    children: [],
    parent: null,
  }
}

export function createTextNode(text) {
  return {
    type: 'TEXT',
    props: { value: text },
    children: [],
    parent: null,
  }
}

export function replaceText(node, text) {
  node.props.value = text
}

export function setProperty(node, name, value) {
  if (name === 'children') {
    return
  }
  if (name === 'key') {
    node.key = value
    return
  }
  node.props[name] = value
}

export function insertNode(parent, node, anchor) {
  node.parent = parent
  if (anchor) {
    const idx = parent.children.indexOf(anchor)
    if (idx !== -1) {
      parent.children.splice(idx, 0, node)
      return
    }
  }
  parent.children.push(node)
}

export function removeNode(parent, node) {
  const idx = parent.children.indexOf(node)
  if (idx >= 0) {
    parent.children.splice(idx, 1)
  }
  node.parent = null
}

export function isTextNode(node) {
  return node.type === 'TEXT'
}

export function getParentNode(node) {
  return node.parent ?? undefined
}

export function getFirstChild(node) {
  return node.children[0]
}

export function getNextSibling(node) {
  if (!node.parent) return undefined
  const idx = node.parent.children.indexOf(node)
  if (idx === -1) return undefined
  return node.parent.children[idx + 1]
}

// Create and export the renderer using solid-js/universal
const rendererInstance = createRenderer({
  createElement,
  createTextNode,
  replaceText,
  setProperty,
  insertNode,
  removeNode,
  isTextNode,
  getParentNode,
  getFirstChild,
  getNextSibling,
})

// Export render, effect, memo, createComponent for runtime use
export const { render, effect, memo, createComponent } = rendererInstance
