/**
 * JSX Runtime for Smithers
 *
 * This module provides the jsx/jsxs/Fragment functions used by babel's
 * automatic JSX runtime to compile JSX to SmithersNode trees.
 */

import type { SmithersNode } from './core/types.js'

/**
 * Type guard for SmithersNode
 */
function isSmithersNode(value: any): value is SmithersNode {
  return value && typeof value === 'object' && 'type' in value && 'props' in value && 'children' in value
}

/**
 * Create a SmithersNode from JSX
 */
function createNode(
  type: string | ((props: any) => any),
  props: Record<string, any>,
  key?: string | number
): SmithersNode | any {
  // Extract children from props
  const { children, ...restProps } = props

  // If type is a function, it's a component - call it
  if (typeof type === 'function') {
    return type(props)
  }

  // Create a SmithersNode
  const node: SmithersNode = {
    type: type as string,
    props: restProps,
    children: [],
    parent: null,
  }

  // Handle key
  if (key !== undefined) {
    node.key = key
  }

  // Process children
  const childArray = Array.isArray(children) ? children.flat(Infinity) : (children != null ? [children] : [])

  for (const child of childArray) {
    if (child == null || child === false || child === true) {
      continue
    }

    if (typeof child === 'string' || typeof child === 'number') {
      // Create text node
      const textNode: SmithersNode = {
        type: 'TEXT',
        props: { value: String(child) },
        children: [],
        parent: node,
      }
      node.children.push(textNode)
    } else if (isSmithersNode(child)) {
      // Add child node
      child.parent = node
      node.children.push(child)
    }
  }

  return node
}

/**
 * jsx function for automatic runtime (single child)
 */
export function jsx(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

/**
 * jsxs function for automatic runtime (multiple children)
 */
export function jsxs(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

/**
 * Fragment - returns children as-is
 */
export function Fragment(props: { children?: any }): any {
  return props.children
}

/**
 * jsxDEV for development mode
 */
export function jsxDEV(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

export type { SmithersNode }
