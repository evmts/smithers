import type { SmithersNode } from './types.js'

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

function addWarningsForUnknownParents(node: SmithersNode | null | undefined): void {
  if (!node || !node.type) {
    return
  }

  node.warnings = []

  if (node.type === 'TEXT') {
    delete node.warnings
    for (const child of node.children) {
      addWarningsForUnknownParents(child)
    }
    return
  }

  const type = node.type.toLowerCase()
  const isKnown = KNOWN_TYPES.has(type)

  let parent = node.parent
  while (parent) {
    const parentType = parent.type.toLowerCase()
    if (KNOWN_TYPES.has(parentType)) break

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

  if (node.warnings.length === 0) delete node.warnings

  for (const child of node.children) {
    addWarningsForUnknownParents(child)
  }
}

export function serialize(node: SmithersNode): string {
  if (!node || !node.type) return ''
  addWarningsForUnknownParents(node)
  return serializeNode(node)
}

function serializeNode(node: SmithersNode): string {
  if (!node || !node.type) return ''
  if (node.type === 'TEXT') return escapeXml(String(node.props['value'] ?? ''))

  const childNodes = node.children.filter(c => c && c.type)
  const hasTextChild = childNodes.some((child) => {
    if (child.type !== 'TEXT') return false
    const value = child.props?.['value']
    return String(value ?? '').length > 0
  })
  const serializedChildren = childNodes.map(serializeNode).filter(s => s)

  if (node.type === 'ROOT') return hasTextChild ? serializedChildren.join('') : serializedChildren.join('\n')

  const tag = node.type.toLowerCase()
  const keyAttr = node.key !== undefined ? ` key="${escapeXml(String(node.key))}"` : ''
  const attrs = serializeProps(node.props)
  const children = hasTextChild ? serializedChildren.join('') : serializedChildren.join('\n')

  if (!children) return `<${tag}${keyAttr}${attrs} />`
  if (hasTextChild) return `<${tag}${keyAttr}${attrs}>${children}</${tag}>`
  return `<${tag}${keyAttr}${attrs}>\n${indent(children)}\n</${tag}>`
}

function containsFunctions(value: unknown, seen = new WeakSet()): boolean {
  if (typeof value === 'function') return true
  if (value === null || typeof value !== 'object') return false
  if (seen.has(value as object)) return false
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.some(item => containsFunctions(item, seen))
  }
  return Object.values(value as Record<string, unknown>).some(v => containsFunctions(v, seen))
}

function serializeProps(props: Record<string, unknown>): string {
  const nonSerializable = new Set([
    'children', 'onFinished', 'onError', 'onStart', 'onComplete', 'onIteration',
    'onProgress', 'onStreamStart', 'onStreamDelta', 'onStreamEnd', 'onStreamPart',
    'onToolCall', 'onReady', 'onApprove', 'onReject', 'validate', 'middleware',
    'key', '__smithersKey', 'ref',
  ])

  return Object.entries(props)
    .filter(([key]) => !nonSerializable.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .filter(([, value]) => !containsFunctions(value))
    .map(([key, value]) => {
      if (typeof value === 'object') {
        try { return ` ${key}="${escapeXml(JSON.stringify(value))}"` }
        catch { return ` ${key}="${escapeXml('[Object (circular or non-serializable)]')}"` }
      }
      return ` ${key}="${escapeXml(String(value))}"`
    })
    .join('')
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
  return str.split('\n').map(line => prefix + line).join('\n')
}
