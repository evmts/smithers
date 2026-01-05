import Anthropic from '@anthropic-ai/sdk'
import type { PluNode, Tool, StreamChunk } from './types.js'

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
 * Rate limit error with retry information
 */
export class RateLimitError extends Error {
  retryAfter: number

  constructor(message: string, retryAfter: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute an API call with exponential backoff retry for rate limits
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Check if it's a rate limit error (status 429)
      if (
        error instanceof Anthropic.RateLimitError ||
        (error instanceof Anthropic.APIError && error.status === 429)
      ) {
        if (attempt === maxRetries) {
          throw new RateLimitError(
            `Rate limit exceeded after ${maxRetries + 1} attempts`,
            baseDelayMs * Math.pow(2, attempt)
          )
        }

        // Extract retry-after header if available, otherwise use exponential backoff
        const retryAfter = baseDelayMs * Math.pow(2, attempt)
        console.warn(`Rate limited, retrying in ${retryAfter}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
        await sleep(retryAfter)
        continue
      }

      // For non-rate-limit errors, throw immediately
      throw error
    }
  }

  throw lastError
}

/**
 * Execute a node using the Claude API
 *
 * Converts the node tree to a prompt, sends it to Claude via the Anthropic SDK,
 * and returns the text response. Implements the full agentic loop for tool execution.
 *
 * @param node The node to execute (claude or subagent type)
 * @param config Optional configuration for the Claude client
 * @returns The text response from Claude
 * @throws {Error} If ANTHROPIC_API_KEY is not found in config or environment
 * @throws {RateLimitError} If rate limit is exceeded after retries
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

  // Extract system message from node props or Persona children
  const system = extractSystemMessage(node)

  // Extract model and maxTokens from node props or use defaults
  const model = (node.props.model as string) || config.model || 'claude-sonnet-4-5-20250929'
  const maxTokens = (node.props.maxTokens as number) || config.maxTokens || 8192
  const maxToolIterations = (node.props.maxToolIterations as number) || 10

  // Extract streaming options
  const streamEnabled = node.props.stream === true
  const onStream = node.props.onStream as ((chunk: StreamChunk) => void) | undefined

  // Convert tools to Anthropic format and build tool lookup map
  const toolDefs = node.props.tools as Tool[] | undefined
  const tools = convertTools(toolDefs)
  const toolMap = buildToolMap(toolDefs)

  // Build the messages array - starts with just the user message
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: prompt,
    },
  ]

  // Agentic loop: keep executing until stop_reason is 'end_turn' or max iterations reached
  let iteration = 0
  let finalResult = ''

  while (iteration < maxToolIterations) {
    iteration++

    try {
      // Create the message with retry for rate limits
      const response = await withRetry(() =>
        client.messages.create({
          model,
          max_tokens: maxTokens,
          messages,
          ...(system ? { system } : {}),
          ...(tools.length > 0 ? { tools } : {}),
        })
      )

      // Extract text content from response
      let textResult = ''
      const toolUseBlocks: Anthropic.ToolUseBlock[] = []

      for (const block of response.content) {
        if (block.type === 'text') {
          textResult += block.text

          // Stream text content if streaming is enabled
          if (streamEnabled && onStream) {
            onStream({
              type: 'text',
              text: block.text,
            })
          }
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block)

          // Stream tool use if streaming is enabled
          if (streamEnabled && onStream) {
            onStream({
              type: 'tool_use',
              tool_use: {
                id: block.id,
                name: block.name,
                input: block.input,
              },
            })
          }
        }
      }

      finalResult = textResult

      // Check if we should stop (no tool calls or stop_reason is 'end_turn')
      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        break
      }

      // Execute tool calls and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolBlock of toolUseBlocks) {
        const tool = toolMap.get(toolBlock.name)

        if (!tool) {
          // Tool not found - return error result
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Error: Tool "${toolBlock.name}" not found`,
            is_error: true,
          })
          continue
        }

        if (!tool.execute) {
          // Tool has no execute function - return error result
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Error: Tool "${toolBlock.name}" has no execute function`,
            is_error: true,
          })
          continue
        }

        try {
          // Execute the tool
          const result = await tool.execute(toolBlock.input)

          // Convert result to string
          const resultStr =
            typeof result === 'string' ? result : JSON.stringify(result)

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: resultStr,
          })
        } catch (error) {
          // Tool execution failed - return error result
          const errorMessage =
            error instanceof Error ? error.message : String(error)

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Error executing tool: ${errorMessage}`,
            is_error: true,
          })
        }
      }

      // Add assistant message with tool use blocks
      messages.push({
        role: 'assistant',
        content: response.content,
      })

      // Add tool results as user message
      messages.push({
        role: 'user',
        content: toolResults,
      })
    } catch (error) {
      // Re-throw rate limit errors after retry exhaustion
      if (error instanceof RateLimitError) {
        throw error
      }

      // Handle other API errors
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Claude API error (${error.status}): ${error.message}`)
      }

      throw error
    }
  }

  if (iteration >= maxToolIterations) {
    console.warn(`Max tool iterations (${maxToolIterations}) reached`)
  }

  return finalResult
}

/**
 * Extract system message from node props or Persona children
 *
 * Looks for:
 * 1. node.props.system - explicit system prop
 * 2. Persona child nodes - extracts role and content to build system message
 *
 * @param node The node to extract system message from
 * @returns The system message string, or undefined if none found
 */
function extractSystemMessage(node: PluNode): string | undefined {
  // First check for explicit system prop
  if (node.props.system && typeof node.props.system === 'string') {
    return node.props.system
  }

  // Look for Persona children
  const personaParts: string[] = []

  function findPersonaNodes(n: PluNode): void {
    if (n.type === 'persona') {
      const role = n.props.role as string | undefined
      const content = getChildrenText(n)

      if (role) {
        personaParts.push(`Role: ${role}`)
      }
      if (content.trim()) {
        personaParts.push(content.trim())
      }
    }

    // Recurse into children
    for (const child of n.children) {
      findPersonaNodes(child)
    }
  }

  findPersonaNodes(node)

  if (personaParts.length > 0) {
    return personaParts.join('\n\n')
  }

  return undefined
}

/**
 * Build a map of tool name to Tool for quick lookup
 */
function buildToolMap(tools: Tool[] | undefined): Map<string, Tool> {
  const map = new Map<string, Tool>()

  if (tools) {
    for (const tool of tools) {
      map.set(tool.name, tool)
    }
  }

  return map
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
