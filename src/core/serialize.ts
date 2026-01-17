import type { SmithersNode } from './types.js'

/**
 * Serialize a SmithersNode tree to XML string.
 * This XML is the "plan" shown to users before execution.
 */
export function serialize(node: SmithersNode): string {
  if (node.type === 'TEXT') {
    return escapeXml(String(node.props.value ?? ''))
  }

  if (node.type === 'ROOT') {
    return node.children.map(serialize).join('\n')
  }

  const tag = node.type.toLowerCase()
  const attrs = serializeProps(node.props)
  const children = node.children.map(serialize).join('\n')

  if (children) {
    return `<${tag}${attrs}>\n${indent(children)}\n</${tag}>`
  }

  return `<${tag}${attrs} />`
}

function serializeProps(props: Record<string, unknown>): string {
  const nonSerializable = new Set(['children', 'onFinished', 'onError'])

  return Object.entries(props)
    .filter(([key]) => !nonSerializable.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
    .join('')
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function indent(str: string, spaces = 2): string {
  const prefix = ' '.repeat(spaces)
  return str.split('\n').map(line => prefix + line).join('\n')
}
