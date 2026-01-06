/**
 * Nested Claude Execution
 *
 * When a <Claude> component contains JSX children (a "plan"), the execution
 * changes from direct execution to tool-mediated execution where Claude
 * controls which nodes to execute via the render_node tool.
 */

import type { SmithersNode, Tool } from './types.js'

/**
 * Result of separating prompt from plan in a Claude node
 */
export interface PromptAndPlan {
  /** Text content that becomes Claude's prompt */
  prompt: string
  /** JSX elements that form the execution plan */
  plan: SmithersNode[]
}

/**
 * Separate text content (prompt) from JSX elements (plan) in a node's children
 *
 * Text nodes become the prompt that Claude will respond to.
 * Non-text nodes (JSX elements) become the plan that Claude can execute via tools.
 *
 * @param node The Claude node to separate
 * @returns Object with prompt string and plan array
 */
export function separatePromptAndPlan(node: SmithersNode): PromptAndPlan {
  const promptParts: string[] = []
  const plan: SmithersNode[] = []

  for (const child of node.children) {
    if (child.type === 'TEXT') {
      const value = (child.props.value as string) ?? ''
      promptParts.push(value)
    } else {
      plan.push(child)
    }
  }

  return {
    prompt: promptParts.join('').trim(),
    plan,
  }
}

/**
 * Check if a Claude node has a plan (JSX children)
 *
 * @param node The Claude node to check
 * @returns true if the node has JSX children that form a plan
 */
export function hasPlan(node: SmithersNode): boolean {
  return node.children.some((child) => child.type !== 'TEXT')
}

/**
 * Generate unique paths for each node in the plan
 *
 * Paths are hierarchical and uniquely identify each node:
 * - "phase[0]" - first phase
 * - "phase[0]/claude[0]" - first claude inside first phase
 * - "phase[1]/step[0]/claude[0]" - deeper nesting
 *
 * @param nodes Array of plan nodes
 * @param prefix Optional path prefix for recursion
 * @returns Map of path -> node
 */
export function generateNodePaths(
  nodes: SmithersNode[],
  prefix: string = ''
): Map<string, SmithersNode> {
  const paths = new Map<string, SmithersNode>()

  // Group nodes by type to generate correct indices
  const typeIndices = new Map<string, number>()

  for (const node of nodes) {
    // Get the current index for this type
    const typeIndex = typeIndices.get(node.type) ?? 0
    typeIndices.set(node.type, typeIndex + 1)

    // Build the path
    const path = prefix
      ? `${prefix}/${node.type}[${typeIndex}]`
      : `${node.type}[${typeIndex}]`

    paths.set(path, node)

    // Recurse for children (excluding TEXT nodes)
    const childNodes = node.children.filter((c) => c.type !== 'TEXT')
    if (childNodes.length > 0) {
      const childPaths = generateNodePaths(childNodes, path)
      childPaths.forEach((n, p) => paths.set(p, n))
    }
  }

  return paths
}

/**
 * Find a node by its path
 *
 * @param nodes Array of plan nodes to search
 * @param path The path to find (e.g., "phase[0]/claude[0]")
 * @returns The node if found, or undefined
 */
export function findNodeByPath(
  nodes: SmithersNode[],
  path: string
): SmithersNode | undefined {
  const paths = generateNodePaths(nodes)
  return paths.get(path)
}

/**
 * Get all executable node paths from a plan
 *
 * Executable nodes are 'claude', 'claude-api', or 'claude-cli' types
 *
 * @param nodes Array of plan nodes
 * @returns Array of paths to executable nodes
 */
export function getExecutableNodePaths(nodes: SmithersNode[]): string[] {
  const paths = generateNodePaths(nodes)
  const executableTypes = ['claude', 'claude-api', 'claude-cli']

  return Array.from(paths.entries())
    .filter(([_, node]) => executableTypes.includes(node.type))
    .map(([path, _]) => path)
}

/**
 * Serialize plan nodes to XML with path attributes
 *
 * Each node in the serialized XML includes a path attribute that
 * Claude can use with the render_node tool.
 *
 * @param nodes Array of plan nodes
 * @param prefix Optional path prefix for recursion
 * @param indent Indentation level
 * @returns XML string with path attributes
 */
export function serializePlanWithPaths(
  nodes: SmithersNode[],
  prefix: string = '',
  indent: number = 0
): string {
  const lines: string[] = []
  const indentStr = '  '.repeat(indent)

  // Group nodes by type to generate correct indices
  const typeIndices = new Map<string, number>()

  for (const node of nodes) {
    // Get the current index for this type
    const typeIndex = typeIndices.get(node.type) ?? 0
    typeIndices.set(node.type, typeIndex + 1)

    // Build the path
    const path = prefix
      ? `${prefix}/${node.type}[${typeIndex}]`
      : `${node.type}[${typeIndex}]`

    // Build attributes string
    const attrs: string[] = [`path="${path}"`]

    // Add other props (excluding children, functions, and internal props)
    for (const [key, value] of Object.entries(node.props)) {
      if (
        key !== 'children' &&
        key !== 'path' &&
        typeof value !== 'function' &&
        !key.startsWith('_')
      ) {
        if (typeof value === 'string') {
          attrs.push(`${key}="${escapeXml(value)}"`)
        } else if (typeof value === 'boolean') {
          attrs.push(`${key}="${value}"`)
        } else if (typeof value === 'number') {
          attrs.push(`${key}="${value}"`)
        } else if (Array.isArray(value)) {
          // For arrays like allowedTools, join with commas
          attrs.push(`${key}="${value.join(',')}"`)
        }
        // Skip objects and other complex types
      }
    }

    const attrStr = attrs.join(' ')

    // Get children content
    const textContent = getTextContent(node)
    const childNodes = node.children.filter((c) => c.type !== 'TEXT')

    if (childNodes.length === 0 && textContent) {
      // Self-contained node with text content
      lines.push(`${indentStr}<${node.type} ${attrStr}>`)
      lines.push(`${indentStr}  ${escapeXml(textContent.trim())}`)
      lines.push(`${indentStr}</${node.type}>`)
    } else if (childNodes.length === 0) {
      // Empty node
      lines.push(`${indentStr}<${node.type} ${attrStr} />`)
    } else {
      // Node with children
      lines.push(`${indentStr}<${node.type} ${attrStr}>`)

      // Add text content if any
      if (textContent.trim()) {
        lines.push(`${indentStr}  ${escapeXml(textContent.trim())}`)
      }

      // Add child nodes
      const childXml = serializePlanWithPaths(childNodes, path, indent + 1)
      if (childXml) {
        lines.push(childXml)
      }

      lines.push(`${indentStr}</${node.type}>`)
    }
  }

  return lines.join('\n')
}

/**
 * Get text content from a node's TEXT children
 */
function getTextContent(node: SmithersNode): string {
  return node.children
    .filter((c) => c.type === 'TEXT')
    .map((c) => (c.props.value as string) ?? '')
    .join('')
}

/**
 * Escape special characters for XML
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Create the render_node tool definition
 *
 * This tool allows Claude to execute specific nodes from the plan
 * by providing the node's path.
 */
export function createRenderNodeTool(): Tool {
  return {
    name: 'render_node',
    description:
      'Execute a specific node from the plan by its path. ' +
      'Use this to trigger execution of <claude> nodes in the plan. ' +
      'The node will be executed and its result returned.',
    input_schema: {
      type: 'object',
      properties: {
        node_path: {
          type: 'string',
          description:
            'The path to the node in the plan (e.g., "phase[0]/claude[0]")',
        },
      },
      required: ['node_path'],
    },
  }
}

/**
 * Build the system prompt addition for plan-aware execution
 *
 * This is appended to Claude's system prompt when it has a plan to execute.
 *
 * @param planXml The serialized plan XML
 * @param executablePaths Array of paths to executable nodes
 * @returns System prompt addition
 */
export function buildPlanSystemPrompt(
  planXml: string,
  executablePaths: string[]
): string {
  return `
You have a plan to execute. The plan is shown below in XML format.

You can execute individual nodes from this plan using the render_node tool.
Each executable node (like <claude>) can be triggered by providing its path.

When you call render_node, the node will be executed and its result returned to you.
You can use this to:
- Execute nodes in any order you choose
- Skip nodes that aren't needed
- Make decisions based on previous node results
- Stop early if the goal is achieved

Executable nodes in this plan:
${executablePaths.map((p) => `- ${p}`).join('\n')}

Plan:
<plan>
${planXml}
</plan>
`.trim()
}

/**
 * Result from executing a node via render_node tool
 */
export interface RenderNodeResult {
  success: boolean
  result?: unknown
  error?: string
  node_type: string
  node_path: string
}
