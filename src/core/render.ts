import type { ReactElement } from 'react'
import type { PluNode, PluRoot } from './types.js'

/**
 * Create a Plue root for rendering
 *
 * STUB: Will be implemented with react-reconciler
 */
export function createRoot(): PluRoot {
  let tree: PluNode | null = null

  return {
    render(element: ReactElement): PluNode {
      // STUB: This will use react-reconciler to build the tree
      console.log('[STUB] createRoot.render() called')

      // For now, create a placeholder tree
      tree = {
        type: 'ROOT',
        props: {},
        children: [],
        parent: null,
      }

      return tree
    },

    unmount(): void {
      tree = null
    },

    getTree(): PluNode | null {
      return tree
    },
  }
}

/**
 * Render a React element to an XML plan string
 *
 * STUB: Will be implemented with react-reconciler + serializer
 */
export async function renderPlan(element: ReactElement): Promise<string> {
  console.log('[STUB] renderPlan() called')

  // STUB: Return example XML
  return `<claude>
  <phase name="example">
    <step>This is a stub plan</step>
    <step>Actual rendering will use react-reconciler</step>
  </phase>
</claude>`
}

/**
 * Serialize a PluNode tree to XML string
 */
export function serialize(node: PluNode): string {
  if (node.type === 'TEXT') {
    return String(node.props.value ?? '')
  }

  if (node.type === 'ROOT') {
    return node.children.map(serialize).join('\n')
  }

  const attrs = Object.entries(node.props)
    .filter(([key]) => key !== 'children' && key !== 'value')
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'object') {
        return `${key}="${escapeXml(JSON.stringify(value))}"`
      }
      return `${key}="${escapeXml(String(value))}"`
    })
    .join(' ')

  const children = node.children.map(serialize).join('\n')
  const tag = node.type.toLowerCase()

  if (children) {
    return `<${tag}${attrs ? ' ' + attrs : ''}>\n${indent(children)}\n</${tag}>`
  }

  return `<${tag}${attrs ? ' ' + attrs : ''} />`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function indent(str: string, spaces = 2): string {
  const prefix = ' '.repeat(spaces)
  return str
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
}
