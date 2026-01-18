import type { SmithersNode } from '../core/types.js'

/**
 * Hyperscript-style function for creating SmithersNode trees.
 * Used by babel to compile JSX to function calls.
 */
export function h(
  type: string | ((props: any) => any),
  props: Record<string, any> | null,
  ...children: any[]
): SmithersNode | any {
  // If type is a function, it's a component - call it with props
  if (typeof type === 'function') {
    const componentProps = { ...props, children: children.length === 1 ? children[0] : children }
    return type(componentProps)
  }

  // Create a SmithersNode
  const node: SmithersNode = {
    type: type as string,
    props: props || {},
    children: [],
    parent: null,
  }

  // Handle key prop specially
  if (node.props.key !== undefined && node.props.key !== null) {
    node.key = node.props.key as string | number
    delete node.props.key
  }

  // Flatten and add children
  const flatChildren = children.flat(Infinity)
  for (const child of flatChildren) {
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
    } else if (Array.isArray(child)) {
      // Recursively handle arrays
      for (const c of child) {
        if (c && isSmithersNode(c)) {
          c.parent = node
          node.children.push(c)
        }
      }
    }
  }

  return node
}

/**
 * Fragment - just returns children as-is
 */
export function Fragment(props: { children?: any }): any {
  return props.children
}

/**
 * Type guard for SmithersNode
 */
function isSmithersNode(value: any): value is SmithersNode {
  return value && typeof value === 'object' && 'type' in value && 'props' in value && 'children' in value
}

export type { SmithersNode }
