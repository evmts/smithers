import Anthropic from '@anthropic-ai/sdk'
import type { PluNode, Tool, StreamChunk, ToolRetryOptions, ExecutionError, ToolExecutionResult } from './types.js'

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
 * Create a detailed execution error with full context
 */
export function createExecutionError(
  message: string,
  options: {
    nodeType: string
    nodePath: string
    input?: string
    failedTool?: string
    toolInput?: unknown
    retriesAttempted?: number
    cause?: Error
  }
): ExecutionError {
  const error = new Error(message) as ExecutionError
  error.name = 'ExecutionError'
  error.nodeType = options.nodeType
  error.nodePath = options.nodePath
  error.input = options.input
  error.failedTool = options.failedTool
  error.toolInput = options.toolInput
  error.retriesAttempted = options.retriesAttempted
  error.cause = options.cause
  return error
}

/**
 * Default tool retry options
 */
const DEFAULT_TOOL_RETRY_OPTIONS: Required<ToolRetryOptions> = {
  maxRetries: 2,
  baseDelayMs: 500,
  exponentialBackoff: true,
  skipOnFailure: [],
  continueOnToolFailure: false,
}

/**
 * Execute a single tool with retry logic
 *
 * @param tool The tool to execute
 * @param input The input to pass to the tool
 * @param options Retry configuration
 * @param onToolError Optional callback for tool errors
 * @returns Result of the tool execution including retry information
 */
async function executeToolWithRetry(
  tool: Tool,
  input: unknown,
  options: Required<ToolRetryOptions>,
  onToolError?: (toolName: string, error: Error, input: unknown) => void
): Promise<ToolExecutionResult> {
  let lastError: Error | null = null
  let retriesAttempted = 0

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      if (!tool.execute) {
        return {
          toolName: tool.name,
          success: false,
          error: new Error(`Tool "${tool.name}" has no execute function`),
          retriesAttempted: 0,
        }
      }

      const result = await tool.execute(input)
      return {
        toolName: tool.name,
        success: true,
        result,
        retriesAttempted,
      }
    } catch (error) {
      lastError = error as Error
      retriesAttempted = attempt

      // Check if this tool should be skipped on failure
      if (options.skipOnFailure.includes(tool.name)) {
        if (onToolError) {
          onToolError(tool.name, lastError, input)
        }
        return {
          toolName: tool.name,
          success: false,
          error: lastError,
          retriesAttempted,
        }
      }

      // Don't retry if we've exhausted attempts
      if (attempt === options.maxRetries) {
        if (onToolError) {
          onToolError(tool.name, lastError, input)
        }
        break
      }

      // Calculate delay with optional exponential backoff
      const delay = options.exponentialBackoff
        ? options.baseDelayMs * Math.pow(2, attempt)
        : options.baseDelayMs

      console.warn(
        `Tool "${tool.name}" failed, retrying in ${delay}ms (attempt ${attempt + 1}/${options.maxRetries + 1}): ${lastError.message}`
      )

      await sleep(delay)
    }
  }

  return {
    toolName: tool.name,
    success: false,
    error: lastError || new Error('Unknown error'),
    retriesAttempted,
  }
}

/**
 * Get node path for error context
 */
export function getNodePath(node: PluNode): string {
  const parts: string[] = []
  let current: PluNode | null = node

  while (current) {
    const name = current.props.name ? `[name="${current.props.name}"]` : ''
    parts.unshift(`${current.type}${name}`)
    current = current.parent
  }

  return parts.join(' > ')
}

/**
 * Safely stringify a value, handling circular references, BigInt, and other edge cases
 *
 * @param value The value to stringify
 * @returns A JSON string or a fallback string representation
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_, val) => {
      // Handle BigInt by converting to string
      if (typeof val === 'bigint') {
        return val.toString()
      }
      return val
    })
  } catch (error) {
    // Handle circular references or other stringification errors
    if (error instanceof TypeError && error.message.includes('circular')) {
      return '[Circular reference detected]'
    }
    // Fallback for any other error
    return String(value)
  }
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
 * @param toolsOverride Optional tools to use instead of node.props.tools
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
  config: ClaudeConfig = {},
  toolsOverride?: Tool[]
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

  // Extract retry configuration
  const apiRetries = (node.props.retries as number) ?? 3
  const toolRetryConfig: Required<ToolRetryOptions> = {
    ...DEFAULT_TOOL_RETRY_OPTIONS,
    ...(node.props.toolRetry as ToolRetryOptions | undefined),
  }

  // Extract streaming options
  const streamEnabled = node.props.stream === true
  const onStream = node.props.onStream as ((chunk: StreamChunk) => void) | undefined

  // Extract tool error callback for graceful degradation
  const onToolError = node.props.onToolError as ((toolName: string, error: Error, input: unknown) => void) | undefined

  // Convert tools to Anthropic format and build tool lookup map
  // Use toolsOverride if provided, otherwise fall back to node.props.tools
  const toolDefs = toolsOverride || (node.props.tools as Tool[] | undefined)
  const tools = convertTools(toolDefs)
  const toolMap = buildToolMap(toolDefs)

  // Get node path for error context
  const nodePath = getNodePath(node)

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
      let response: Anthropic.Message

      // Use streaming API if enabled, otherwise use standard API
      if (streamEnabled && onStream) {
        // Use streaming API with proper event handling
        response = await withRetry(async () => {
          const stream = client.messages.stream({
            model,
            max_tokens: maxTokens,
            messages,
            ...(system ? { system } : {}),
            ...(tools.length > 0 ? { tools } : {}),
          })

          // Handle text deltas as they arrive
          stream.on('text', (text) => {
            onStream({
              type: 'text',
              text,
            })
          })

          // Handle tool use via streamEvent to access full content block
          stream.on('streamEvent', (event) => {
            if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
              onStream({
                type: 'tool_use',
                tool_use: {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: event.content_block.input,
                },
              })
            }
          })

          // Wait for final message
          return await stream.finalMessage()
        }, apiRetries)
      } else {
        // Use non-streaming API for better performance when streaming not needed
        response = await withRetry(() =>
          client.messages.create({
            model,
            max_tokens: maxTokens,
            messages,
            ...(system ? { system } : {}),
            ...(tools.length > 0 ? { tools } : {}),
          }),
          apiRetries
        )
      }

      // Extract text content and tool use blocks from response
      let textResult = ''
      const toolUseBlocks: Anthropic.ToolUseBlock[] = []

      for (const block of response.content) {
        if (block.type === 'text') {
          textResult += block.text
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block)
        }
      }

      finalResult = textResult

      // Check if we should stop (no tool calls or stop_reason is 'end_turn')
      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        break
      }

      // Execute tool calls and collect results with retry logic
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      const toolExecutionResults: ToolExecutionResult[] = []
      let hasToolFailures = false

      for (const toolBlock of toolUseBlocks) {
        const tool = toolMap.get(toolBlock.name)

        if (!tool) {
          // Tool not found - return error result
          const notFoundError = new Error(`Tool "${toolBlock.name}" not found`)
          if (onToolError) {
            onToolError(toolBlock.name, notFoundError, toolBlock.input)
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Error: Tool "${toolBlock.name}" not found`,
            is_error: true,
          })
          hasToolFailures = true
          toolExecutionResults.push({
            toolName: toolBlock.name,
            success: false,
            error: notFoundError,
            retriesAttempted: 0,
          })
          continue
        }

        // Execute tool with retry logic
        const execResult = await executeToolWithRetry(
          tool,
          toolBlock.input,
          toolRetryConfig,
          onToolError
        )

        toolExecutionResults.push(execResult)

        if (execResult.success) {
          // Convert result to string with safe serialization
          const resultStr =
            typeof execResult.result === 'string'
              ? execResult.result
              : safeStringify(execResult.result)

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: resultStr,
          })
        } else {
          hasToolFailures = true
          const errorMessage = execResult.error?.message || 'Unknown error'
          const retriesInfo = execResult.retriesAttempted > 0
            ? ` (after ${execResult.retriesAttempted + 1} attempts)`
            : ''

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: `Error executing tool${retriesInfo}: ${errorMessage}`,
            is_error: true,
          })
        }
      }

      // If all tools failed and we're not configured to continue on failure, throw
      const allToolsFailed = toolExecutionResults.length > 0 &&
        toolExecutionResults.every(r => !r.success)

      if (allToolsFailed && !toolRetryConfig.continueOnToolFailure) {
        const failedTools = toolExecutionResults
          .filter(r => !r.success)
          .map(r => `${r.toolName}: ${r.error?.message}`)
          .join('; ')

        throw createExecutionError(
          `All tool executions failed: ${failedTools}`,
          {
            nodeType: node.type,
            nodePath,
            input: prompt,
            failedTool: toolExecutionResults[0]?.toolName,
            toolInput: toolUseBlocks[0]?.input,
            retriesAttempted: toolExecutionResults.reduce((max, r) => Math.max(max, r.retriesAttempted), 0),
          }
        )
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

      // Re-throw ExecutionError (already has context)
      if ((error as ExecutionError).nodeType) {
        throw error
      }

      // Handle other API errors with enhanced context
      if (error instanceof Anthropic.APIError) {
        throw createExecutionError(
          `Claude API error (${error.status}): ${error.message}`,
          {
            nodeType: node.type,
            nodePath,
            input: prompt,
            cause: error,
          }
        )
      }

      // Wrap unknown errors with context
      throw createExecutionError(
        error instanceof Error ? error.message : String(error),
        {
          nodeType: node.type,
          nodePath,
          input: prompt,
          cause: error instanceof Error ? error : undefined,
        }
      )
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
