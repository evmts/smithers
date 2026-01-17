import type { SmithersNode } from './types.js'

/**
 * Props that should not be serialized to XML (runtime-only, not part of the plan)
 */
const NON_SERIALIZABLE_PROPS = new Set([
  'children',
  'onFinished',
  'onError',
  'onStreamStart',
  'onStreamDelta',
  'onStreamEnd',
  'validate',
])

/**
 * Serialize a SmithersNode tree to XML string.
 * This XML is the "plan" shown to users.
 *
 * @param node - The root SmithersNode to serialize
 * @returns XML string representation of the tree
 *
 * @example
 * ```tsx
 * const root = createSmithersRoot()
 * root.mount(() => <Claude>Hello</Claude>)
 * const xml = serialize(root.getTree())
 * // Output: <claude>Hello</claude>
 * ```
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
  const entries = Object.entries(props)
    .filter(([key]) => !NON_SERIALIZABLE_PROPS.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .filter(([, value]) => typeof value !== 'function')
    .map(([key, value]) => {
      if (typeof value === 'object') {
        return ` ${key}="${escapeXml(JSON.stringify(value))}"`
      }
      return ` ${key}="${escapeXml(String(value))}"`
    })

  return entries.join('')
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
    .map(line => prefix + line)
    .join('\n')
}
