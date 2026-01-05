import Anthropic from '@anthropic-ai/sdk'
import type { PluNode, Tool } from './types.js'

/**
 * Configuration for Claude API client
 */
export interface ClaudeConfig {
  /** Anthropic API key. If not provided, uses ANTHROPIC_API_KEY env var */
  apiKey?: string
  /** Model to use. Default: 'claude-sonnet-4-5-20250929' */
  model?: string
  /** Maximum tokens to generate. Default: 8192 */
  maxTokens?: number
}

/**
 * Execute a node using the Claude API
 *
 * Converts the node tree to a prompt, sends it to Claude via the Anthropic SDK,
 * and returns the text response.
 *
 * @param node The node to execute (claude or subagent type)
 * @param config Optional configuration for the Claude client
 * @returns The text response from Claude
 * @throws {Error} If ANTHROPIC_API_KEY is not found in config or environment
 *
 * @example
 * ```typescript
 * const response = await executeWithClaude(claudeNode, {
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   model: 'claude-sonnet-4-5-20250929',
 *   maxTokens: 4096
 * })
 * ```
 */
export async function executeWithClaude(
  node: PluNode,
  config: ClaudeConfig = {}
): Promise<string> {
  // Get API key from config or environment
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not found. Set it in your environment or pass it in config.'
    )
  }

  // Initialize Claude client
  const client = new Anthropic({
    apiKey,
  })

  // Extract the prompt from the node
  const prompt = serializeNodeToPrompt(node)

  // Extract model and maxTokens from node props or use defaults
  const model = (node.props.model as string) || config.model || 'claude-sonnet-4-5-20250929'
  const maxTokens = (node.props.maxTokens as number) || config.maxTokens || 8192

  // Convert tools to Anthropic format
  const tools = convertTools(node.props.tools as Tool[] | undefined)

  // Create the message
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    ...(tools.length > 0 ? { tools } : {}),
  })

  // Extract text content from response
  let result = ''
  for (const block of response.content) {
    if (block.type === 'text') {
      result += block.text
    }
  }

  // Handle tool calls if present
  // TODO: Implement tool execution loop for tool_use blocks
  // For now, just return the text content
  const toolCalls = response.content.filter((block) => block.type === 'tool_use')
  if (toolCalls.length > 0) {
    // Store tool calls in the result for future processing
    // In a full implementation, we'd execute these tools and continue the conversation
    console.warn('Tool calls detected but not yet implemented:', toolCalls.length)
  }

  return result
}

/**
 * Serialize a node and its children to a prompt string
 *
 * Converts semantic components like <persona>, <constraints>, etc. into
 * XML-like tags, and extracts text content from TEXT nodes.
 *
 * @param node The node to serialize
 * @returns The prompt string with XML tags for semantic components
 */
function serializeNodeToPrompt(node: PluNode): string {
  const parts: string[] = []

  // Handle different node types
  switch (node.type) {
    case 'persona':
      parts.push(`<persona role="${node.props.role}">`)
      parts.push(getChildrenText(node))
      parts.push('</persona>')
      break

    case 'constraints':
      parts.push('<constraints>')
      parts.push(getChildrenText(node))
      parts.push('</constraints>')
      break

    case 'output-format':
      parts.push('<output-format>')
      if (node.props.schema) {
        parts.push(`Schema: ${JSON.stringify(node.props.schema)}`)
      }
      parts.push(getChildrenText(node))
      parts.push('</output-format>')
      break

    case 'phase':
      parts.push(`<phase name="${node.props.name}">`)
      parts.push(getChildrenText(node))
      parts.push('</phase>')
      break

    case 'step':
      parts.push('<step>')
      parts.push(getChildrenText(node))
      parts.push('</step>')
      break

    case 'TEXT':
      return String(node.props.value ?? '')

    case 'claude':
    case 'subagent':
      // For claude/subagent, just get the children
      return getChildrenText(node)

    default:
      // For unknown types, just get children
      return getChildrenText(node)
  }

  return parts.join('\n')
}

/**
 * Extract text content from a node's children
 *
 * Recursively traverses the node tree and collects all text content from TEXT nodes.
 * The reconciler automatically creates TEXT nodes for string children, so we don't
 * need to check props.children separately.
 *
 * @param node The node to extract text from
 * @returns Combined text content from all children
 */
function getChildrenText(node: PluNode): string {
  const parts: string[] = []

  for (const child of node.children) {
    if (child.type === 'TEXT') {
      parts.push(String(child.props.value ?? ''))
    } else {
      parts.push(serializeNodeToPrompt(child))
    }
  }

  return parts.join('\n')
}

/**
 * Convert Smithers Tool definitions to Anthropic tool format
 *
 * Transforms Smithers tool definitions into the format expected by the
 * Anthropic API. Supports both input_schema (preferred) and the deprecated
 * parameters field for backward compatibility.
 *
 * @param tools Array of Smithers Tool definitions, or undefined
 * @returns Array of Anthropic.Tool objects for the API
 */
function convertTools(tools: Tool[] | undefined): Anthropic.Tool[] {
  if (!tools || tools.length === 0) {
    return []
  }

  return tools.map((tool) => {
    let inputSchema = tool.input_schema

    // Backward compatibility: convert deprecated parameters field to input_schema
    if (!inputSchema && tool.parameters) {
      console.warn(
        `Tool "${tool.name}": parameters field is deprecated. Use input_schema instead.`
      )

      // Extract properties and required fields from old format
      // Old format: { paramName: { type: '...', required: true }, ... }
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(tool.parameters)) {
        if (value && typeof value === 'object') {
          const paramDef = value as Record<string, unknown>

          // Extract required flag and remove it from the property definition
          if (paramDef.required === true) {
            required.push(key)
          }

          // Copy property definition without the 'required' field
          const { required: _, ...propertySchema } = paramDef
          properties[key] = propertySchema
        } else {
          properties[key] = value
        }
      }

      inputSchema = {
        type: 'object' as const,
        properties,
        required,
      }
    }

    // Default to empty schema if neither is provided
    if (!inputSchema) {
      inputSchema = {
        type: 'object' as const,
        properties: {},
        required: [],
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema: inputSchema,
    }
  })
}
