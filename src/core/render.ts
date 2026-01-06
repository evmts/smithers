import type { ReactElement } from 'react'
import type { SmithersNode, SmithersRoot } from './types.js'
import { createSmithersRoot } from '../reconciler/index.js'

/**
 * Create a Smithers root for rendering
 */
export function createRoot(): SmithersRoot {
  return createSmithersRoot()
}

/**
 * Render a React element to an XML plan string
 */
export async function renderPlan(element: ReactElement): Promise<string> {
  const root = createRoot()
  const tree = await root.render(element)
  const xml = serialize(tree)
  root.unmount()
  return xml
}

/**
 * Serialize a SmithersNode tree to XML string
 */
export function serialize(node: SmithersNode): string {
  if (node.type === 'TEXT') {
    return escapeXml(String(node.props.value ?? ''))
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
