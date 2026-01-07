/**
 * Utility functions for tree traversal and path manipulation
 */

import type { SmithersNode } from '../core/types.js'

/**
 * Get the path for a node in the tree
 * e.g., "ROOT/phase[0]/claude[1]"
 */
export function getNodePath(node: SmithersNode): string {
  const parts: string[] = []
  let current: SmithersNode | null = node

  while (current) {
    if (current.type === 'ROOT') {
      parts.unshift('ROOT')
      break
    }

    // Find the index of this node among siblings of the same type
    const parent = current.parent
    if (parent) {
      const siblings = parent.children.filter((n) => n.type === current!.type)
      const index = siblings.indexOf(current)
      parts.unshift(`${current.type}[${index}]`)
    } else {
      parts.unshift(current.type)
    }

    current = current.parent
  }

  return parts.join('/')
}

/**
 * Find a node by its path
 */
export function findNodeByPath(
  root: SmithersNode,
  path: string
): SmithersNode | null {
  if (path === 'ROOT') {
    return root
  }

  const parts = path.split('/').filter((p) => p !== 'ROOT')
  let current = root

  for (const part of parts) {
    const match = part.match(/^(.+?)\[(\d+)\]$/)
    if (!match) {
      return null
    }

    const [, type, indexStr] = match
    const index = Number.parseInt(indexStr, 10)

    const siblings = current.children.filter((n) => n.type === type)
    if (index >= siblings.length) {
      return null
    }

    current = siblings[index]
  }

  return current
}

/**
 * Get all visible nodes in depth-first order
 * (respects expanded/collapsed state)
 */
export function getVisibleNodes(
  root: SmithersNode,
  expandedPaths: Set<string>
): Array<{ node: SmithersNode; path: string; depth: number }> {
  const result: Array<{ node: SmithersNode; path: string; depth: number }> = []

  function traverse(node: SmithersNode, depth: number) {
    const path = getNodePath(node)
    result.push({ node, path, depth })

    // Only traverse children if this node is expanded (or if it's ROOT)
    if (node.type === 'ROOT' || expandedPaths.has(path)) {
      for (const child of node.children) {
        traverse(child, depth + 1)
      }
    }
  }

  traverse(root, 0)
  return result
}

/**
 * Get the next visible node in depth-first order
 */
export function getNextVisibleNode(
  root: SmithersNode,
  currentPath: string,
  expandedPaths: Set<string>
): string | null {
  const visible = getVisibleNodes(root, expandedPaths)
  const currentIndex = visible.findIndex((v) => v.path === currentPath)

  if (currentIndex === -1 || currentIndex === visible.length - 1) {
    return null
  }

  return visible[currentIndex + 1].path
}

/**
 * Get the previous visible node in depth-first order
 */
export function getPrevVisibleNode(
  root: SmithersNode,
  currentPath: string,
  expandedPaths: Set<string>
): string | null {
  const visible = getVisibleNodes(root, expandedPaths)
  const currentIndex = visible.findIndex((v) => v.path === currentPath)

  if (currentIndex <= 0) {
    return null
  }

  return visible[currentIndex - 1].path
}

/**
 * Check if a node has children
 */
export function hasChildren(node: SmithersNode): boolean {
  return node.children.length > 0
}

/**
 * Get a display label for a node
 */
export function getNodeLabel(node: SmithersNode): string {
  const name = node.props.name as string | undefined

  // For named nodes, show type and name
  if (name != null && name !== '') {
    return `${node.type}: ${name}`
  }

  // For TEXT nodes, show truncated content
  if (node.type === 'TEXT') {
    const value = String(node.props.value || '')
    return value.length > 50 ? `${value.slice(0, 50)}...` : value
  }

  // Otherwise just show type
  return node.type
}

/**
 * Get status badge text for a node
 */
export function getStatusBadge(node: SmithersNode): string {
  if (!node._execution) {
    return '[pending]'
  }

  switch (node._execution.status) {
    case 'pending':
      return '[pending]'
    case 'running':
      return '[running]'
    case 'complete':
      return '[complete]'
    case 'error':
      return '[error]'
    default:
      return '[unknown]'
  }
}

/**
 * Get color name for status (OpenTUI compatible)
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case '[pending]':
      return '#888888' // Gray
    case '[running]':
      return '#ffff00' // Yellow
    case '[complete]':
      return '#00ff00' // Green
    case '[error]':
      return '#ff0000' // Red
    default:
      return '#ffffff' // White
  }
}

/**
 * Get icon for a node based on its state
 */
export function getNodeIcon(
  node: SmithersNode,
  isExpanded: boolean,
  isSelected: boolean
): string {
  if (isSelected) {
    return '→'
  }

  if (hasChildren(node)) {
    return isExpanded ? '▼' : '▶'
  }

  return '•'
}
