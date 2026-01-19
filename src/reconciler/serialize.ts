import type { SmithersNode } from './types.js'

/**
 * Known component types that have meaning in Smithers.
 * If a known type appears under an unknown parent, we add a warning.
 */
const KNOWN_TYPES = new Set([
  // Core orchestration
  'claude',
  'amp',
  'ralph',
  'phase',
  'step',
  'task',
  'orchestration',
  'root',

  // Control flow
  'while',
  'if',
  'switch',
  'each',
  'parallel',
  'end',

  // Agent components
  'subagent',
  'smithers-subagent',
  'claude-api',
  'codex',
  'gemini',
  'fallback-agent',

  // Prompt building
  'persona',
  'constraints',
  'text',
  'messages',
  'message',
  'tool-call',

  // Human interaction
  'human',
  'smithers-stop',
  'review',

  // VCS/Git
  'worktree',
  'commit',
  'git-notes',
  'jj',

  // MCP
  'mcp-tool',
  'sqlite',

  // Infrastructure
  'command',
  'hooks',
])

/**
 * Add warnings to nodes when known components appear inside unknown elements.
 * This helps detect accidental nesting like <loop><Claude>...</Claude></loop>
 * where the user likely didn't want Claude to execute.
 */
function addWarningsForUnknownParents(node: SmithersNode): void {
  // Clear previous warnings to ensure idempotency when serialize() is called multiple times
  node.warnings = []

  const type = node.type.toLowerCase()
  const isKnown = KNOWN_TYPES.has(type)

  // Walk up to find unknown parent
  let parent = node.parent
  while (parent) {
    const parentType = parent.type.toLowerCase()

    // If parent is a known type, stop walking - the parent will get its own warning if needed.
    // This prevents redundant warnings for deeply nested known components.
    if (KNOWN_TYPES.has(parentType)) {
      break
    }

    if (parent.type !== 'ROOT') {
      if (isKnown) {
        node.warnings.push(
          `<${node.type}> rendered inside unknown element <${parent.type}>`
        )
      }
      break
    }
    parent = parent.parent
  }

  // Clean up: remove empty warnings array
  if (node.warnings.length === 0) {
    delete node.warnings
  }

  // Recurse to children
  for (const child of node.children) {
    addWarningsForUnknownParents(child)
  }
}

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

  // Add warnings for known components under unknown parents (once at root)
  addWarningsForUnknownParents(node)

  return serializeNode(node)
}

/**
 * Internal recursive serialization (doesn't add warnings).
 */
function serializeNode(node: SmithersNode): string {
  // Skip null/undefined nodes
  if (!node || !node.type) {
    return ''
  }

  // TEXT nodes: just escape and return the value
  if (node.type === 'TEXT') {
    return escapeXml(String(node.props['value'] ?? ''))
  }

  // ROOT nodes: serialize children without wrapper tags
  if (node.type === 'ROOT') {
    return node.children.filter(c => c && c.type).map(serializeNode).filter(s => s).join('\n')
  }

  const tag = node.type.toLowerCase()

  // Key attribute goes FIRST (if present) for readability
  const keyAttr = node.key !== undefined ? ` key="${escapeXml(String(node.key))}"` : ''

  // Then other props (filtered and escaped)
  const attrs = serializeProps(node.props)

  // Serialize children recursively
  const children = node.children.filter(c => c && c.type).map(serializeNode).filter(s => s).join('\n')

  // Self-closing tag if no children
  if (!children) {
    return `<${tag}${keyAttr}${attrs} />`
  }

  // Otherwise wrap children with indentation
  return `<${tag}${keyAttr}${attrs}>\n${indent(children)}\n</${tag}>`
}

/**
 * Check if a value contains functions (recursively).
 * Used to filter out non-serializable props like middleware arrays.
 */
function containsFunctions(value: unknown, seen = new WeakSet()): boolean {
  if (typeof value === 'function') return true
  if (value === null || typeof value !== 'object') return false

  // Prevent infinite recursion on circular references
  if (seen.has(value as object)) return false
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.some(item => containsFunctions(item, seen))
  }
  return Object.values(value as Record<string, unknown>).some(v => containsFunctions(v, seen))
}

/**
 * Serialize props to XML attributes.
 *
 * GOTCHA: Several props must be filtered out:
 * - callbacks (onFinished, onError, etc.)
 * - children (handled separately)
 * - key (handled separately via node.key)
 * - any function values (including nested in arrays/objects)
 */
function serializeProps(props: Record<string, unknown>): string {
  // Props that should never appear in XML (common callback/config names)
  const nonSerializable = new Set([
    'children',      // Handled separately, not a prop
    'onFinished',    // Callbacks are runtime-only
    'onError',
    'onStart',
    'onComplete',
    'onIteration',
    'onProgress',
    'onStreamStart',
    'onStreamDelta',
    'onStreamEnd',
    'onStreamPart',
    'onToolCall',
    'onReady',
    'onApprove',
    'onReject',
    'validate',      // Functions don't serialize
    'middleware',    // Middleware arrays contain functions
    'key',           // Stored on node.key, not props
  ])

  return Object.entries(props)
    .filter(([key]) => !nonSerializable.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .filter(([, value]) => !containsFunctions(value))  // Filter functions recursively
    .map(([key, value]) => {
      // GOTCHA: Object props need to be serialized as JSON
      if (typeof value === 'object') {
        try {
          return ` ${key}="${escapeXml(JSON.stringify(value))}"`
        } catch {
          // Handle circular references and other stringify errors
          return ` ${key}="${escapeXml('[Object (circular or non-serializable)]')}"`
        }
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
