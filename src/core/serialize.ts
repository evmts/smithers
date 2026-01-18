import type { SmithersNode } from './types.js'

/**
 * Serialize a SmithersNode tree to XML string.
 * This XML is the "plan" shown to users before execution.
 *
 * GOTCHA: When testing entity escaping, create nodes MANUALLY without JSX!
 * JSX pre-escapes entities, so using JSX in tests will cause double-escaping.
 *
 * Example transformations:
 * - { type: 'task', props: { name: 'test' }, children: [] } → '<task name="test" />'
 * - { type: 'ROOT', children: [...] } → children joined with \n (no <ROOT> wrapper)
 * - node.key appears FIRST in attributes (before other props)
 */
export function serialize(node: SmithersNode): string {
  // Skip null/undefined nodes
  if (!node || !node.type) {
    return ''
  }

  // TEXT nodes: just escape and return the value
  if (node.type === 'TEXT') {
    return escapeXml(String(node.props.value ?? ''))
  }

  // ROOT nodes: serialize children without wrapper tags
  if (node.type === 'ROOT') {
    return node.children.filter(c => c && c.type).map(serialize).filter(s => s).join('\n')
  }

  const tag = node.type.toLowerCase()

  // Key attribute goes FIRST (if present) for readability
  const keyAttr = node.key !== undefined ? ` key="${escapeXml(String(node.key))}"` : ''

  // Then other props (filtered and escaped)
  const attrs = serializeProps(node.props)

  // Serialize children recursively
  const children = node.children.filter(c => c && c.type).map(serialize).filter(s => s).join('\n')

  // Self-closing tag if no children
  if (!children) {
    return `<${tag}${keyAttr}${attrs} />`
  }

  // Otherwise wrap children with indentation
  return `<${tag}${keyAttr}${attrs}>\n${indent(children)}\n</${tag}>`
}

/**
 * Serialize props to XML attributes.
 *
 * GOTCHA: Several props must be filtered out:
 * - callbacks (onFinished, onError, etc.)
 * - children (handled separately)
 * - key (handled separately via node.key)
 * - any function values
 */
function serializeProps(props: Record<string, unknown>): string {
  // Props that should never appear in XML
  const nonSerializable = new Set([
    'children',      // Handled separately, not a prop
    'onFinished',    // Callbacks are runtime-only
    'onError',
    'onStreamStart',
    'onStreamDelta',
    'onStreamEnd',
    'validate',      // Functions don't serialize
    'key',           // Stored on node.key, not props
  ])

  return Object.entries(props)
    .filter(([key]) => !nonSerializable.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .filter(([, value]) => typeof value !== 'function')  // Extra safety: no functions
    .map(([key, value]) => {
      // GOTCHA: Object props need to be serialized as JSON
      if (typeof value === 'object') {
        return ` ${key}="${escapeXml(JSON.stringify(value))}"`
      }
      return ` ${key}="${escapeXml(String(value))}"`
    })
    .join('')
}

/**
 * Escape XML entities.
 *
 * CRITICAL GOTCHA: & MUST be replaced FIRST!
 * Otherwise you'll double-escape: '<' → '&lt;' → '&amp;lt;' ☠️
 *
 * Correct order: & first, then others
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')   // MUST be first!
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')  // Optional but good to have
}

function indent(str: string, spaces = 2): string {
  const prefix = ' '.repeat(spaces)
  return str.split('\n').map(line => prefix + line).join('\n')
}
