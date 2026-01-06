/**
 * Claude Agent SDK executor
 *
 * Executes prompts using the Claude Agent SDK, which provides built-in tools
 * for file operations, bash commands, web search, and more.
 *
 * When a Claude node has JSX children (a plan), the plan is serialized to XML
 * and shown to Claude via the system prompt, giving context about the workflow.
 */

import { query, type Options, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { SmithersNode, ClaudeProps, ExecutionError } from './types.js'
import {
  separatePromptAndPlan,
  hasPlan,
  serializePlanWithPaths,
  getExecutableNodePaths,
  buildPlanSystemPrompt,
} from './nested-execution.js'

/**
 * Extract text content from a SmithersNode tree (all text, including nested)
 */
function extractTextContent(node: SmithersNode): string {
  const parts: string[] = []

  function walk(n: SmithersNode) {
    if (n.type === 'TEXT' && typeof n.props.value === 'string') {
      parts.push(n.props.value)
    }
    for (const child of n.children) {
      walk(child)
    }
  }

  walk(node)
  return parts.join('').trim()
}

/**
 * Build SDK options from ClaudeProps
 */
function buildOptions(props: ClaudeProps): Options {
  const options: Options = {}

  // Tool configuration
  if (props.allowedTools) {
    options.allowedTools = props.allowedTools
  }
  if (props.disallowedTools) {
    options.disallowedTools = props.disallowedTools
  }
  if (props.tools) {
    options.tools = props.tools
  }

  // Model and execution
  if (props.model) {
    options.model = props.model
  }
  if (props.maxTurns !== undefined) {
    options.maxTurns = props.maxTurns
  }
  if (props.maxBudgetUsd !== undefined) {
    options.maxBudgetUsd = props.maxBudgetUsd
  }
  if (props.maxThinkingTokens !== undefined) {
    options.maxThinkingTokens = props.maxThinkingTokens
  }

  // System prompt
  if (props.systemPrompt) {
    options.systemPrompt = props.systemPrompt
  }

  // Permissions
  if (props.permissionMode) {
    options.permissionMode = props.permissionMode
  }
  if (props.allowDangerouslySkipPermissions) {
    options.allowDangerouslySkipPermissions = props.allowDangerouslySkipPermissions
  }

  // Advanced features
  if (props.cwd) {
    options.cwd = props.cwd
  }
  if (props.mcpServers) {
    options.mcpServers = props.mcpServers as Record<string, any>
  }
  if (props.agents) {
    options.agents = props.agents
  }
  if (props.schema) {
    const jsonSchema = zodToJsonSchema(props.schema)
    options.outputFormat = {
      type: 'json_schema',
      schema: jsonSchema as Record<string, unknown>,
    }
  }
  if (props.resume) {
    options.resume = props.resume
  }
  if (props.additionalDirectories) {
    options.additionalDirectories = props.additionalDirectories
  }
  if (props.settingSources) {
    options.settingSources = props.settingSources
  }

  return options
}

/**
 * Create an ExecutionError with context
 */
function createAgentExecutionError(
  message: string,
  node: SmithersNode,
  nodePath: string,
  cause?: Error
): ExecutionError {
  const error = new Error(message) as ExecutionError
  error.nodeType = node.type
  error.nodePath = nodePath
  error.cause = cause
  return error
}

export interface AgentExecutionResult {
  success: boolean
  result?: string
  structuredOutput?: unknown
  error?: string
  numTurns: number
  totalCostUsd: number
  durationMs: number
}

/**
 * Execute a prompt using the Claude Agent SDK
 *
 * If the node has JSX children (a plan), the plan is serialized and shown
 * to Claude via the system prompt. This gives Claude context about the
 * workflow structure while Ralph handles actual node execution.
 */
export async function executeWithAgentSdk(
  node: SmithersNode,
  nodePath: string
): Promise<AgentExecutionResult> {
  const props = node.props as ClaudeProps
  const options = buildOptions(props)

  // Check if this node has a plan (JSX children)
  let prompt: string
  if (hasPlan(node)) {
    // Separate text prompt from JSX plan
    const { prompt: textPrompt, plan } = separatePromptAndPlan(node)

    // Serialize the plan to XML with paths
    const planXml = serializePlanWithPaths(plan)
    const executablePaths = getExecutableNodePaths(plan)

    // Build the plan-aware system prompt
    const planSystemPrompt = buildPlanSystemPrompt(planXml, executablePaths)

    // Combine with any existing system prompt
    if (options.systemPrompt) {
      if (typeof options.systemPrompt === 'string') {
        options.systemPrompt = options.systemPrompt + '\n\n' + planSystemPrompt
      } else if (options.systemPrompt.type === 'preset') {
        // For preset system prompts, append via the append field
        options.systemPrompt = {
          ...options.systemPrompt,
          append: (options.systemPrompt.append || '') + '\n\n' + planSystemPrompt,
        }
      }
    } else {
      options.systemPrompt = planSystemPrompt
    }

    // Use the text prompt only (plan is in system prompt)
    prompt = textPrompt || 'Execute the plan as described.'
  } else {
    // No plan - use all text content as the prompt
    prompt = extractTextContent(node)
  }

  let result: AgentExecutionResult = {
    success: false,
    numTurns: 0,
    totalCostUsd: 0,
    durationMs: 0,
  }

  try {
    const queryIterator = query({ prompt, options })

    // Iterate through all messages
    for await (const message of queryIterator) {
      // Check for result message (final message)
      if (message.type === 'result') {
        const resultMsg = message as SDKResultMessage
        result.numTurns = resultMsg.num_turns
        result.totalCostUsd = resultMsg.total_cost_usd
        result.durationMs = resultMsg.duration_ms

        if (resultMsg.subtype === 'success') {
          result.success = true
          result.result = resultMsg.result
          if (resultMsg.structured_output !== undefined) {
            result.structuredOutput = resultMsg.structured_output
          }
        } else {
          // Error result
          result.success = false
          if ('errors' in resultMsg && resultMsg.errors) {
            result.error = resultMsg.errors.join('; ')
          } else {
            result.error = `Execution failed: ${resultMsg.subtype}`
          }
        }
      }
    }

    return result
  } catch (error) {
    const execError = createAgentExecutionError(
      error instanceof Error ? error.message : 'Unknown error during Agent SDK execution',
      node,
      nodePath,
      error instanceof Error ? error : undefined
    )
    throw execError
  }
}

/**
 * Mock execution for testing
 *
 * Simulates Agent SDK execution, including plan detection.
 *
 * Features:
 * - Detects "fail intentionally" in prompt and throws error for error testing
 * - Extracts JSON from prompt and returns it for structured output testing
 * - Returns mock responses for general testing
 */
export async function executeAgentMock(node: SmithersNode): Promise<AgentExecutionResult> {
  // Simulate some processing time
  await new Promise((resolve) => setTimeout(resolve, 10))

  // Extract ALL text content (including from nested elements) for error detection
  const fullTextContent = extractTextContent(node)

  // Test helper: Detect "fail intentionally" anywhere and throw an error
  // This must be checked first, before any plan detection
  if (fullTextContent.toLowerCase().includes('fail intentionally')) {
    throw new Error('Simulated failure for testing')
  }

  // Test helper: Extract JSON from prompt for structured output testing
  // Check this BEFORE plan detection so structured output tests work with plans
  const jsonMatch = extractJsonFromPrompt(fullTextContent)
  if (jsonMatch) {
    return {
      success: true,
      result: jsonMatch,
      numTurns: 1,
      totalCostUsd: 0,
      durationMs: 10,
    }
  }

  // Check if this node has a plan
  let prompt: string
  if (hasPlan(node)) {
    const { prompt: textPrompt, plan } = separatePromptAndPlan(node)
    prompt = textPrompt || 'Execute the plan.'

    // In mock mode, we log that there's a plan for debugging
    const executablePaths = getExecutableNodePaths(plan)

    return {
      success: true,
      result: `Hello, I am Smithers! [Mock Agent SDK Response] Plan detected with ${executablePaths.length} executable node(s). Prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
      numTurns: 1,
      totalCostUsd: 0,
      durationMs: 10,
    }
  }

  prompt = fullTextContent

  // Default mock response includes "Smithers" for backward compatibility with existing tests
  return {
    success: true,
    result: `Hello, I am Smithers! [Mock Agent SDK Response] Processed: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
    numTurns: 1,
    totalCostUsd: 0,
    durationMs: 10,
  }
}

/**
 * Extract JSON object from prompt text
 * Looks for JSON.stringify(...) calls or raw JSON objects
 */
function extractJsonFromPrompt(text: string): string | null {
  // First try to find JSON.stringify(...) calls
  const jsonStringifyMatch = text.match(/JSON\.stringify\((.+?)\)/)
  if (jsonStringifyMatch) {
    return jsonStringifyMatch[1]
  }

  // Try to find raw JSON objects
  const startIndex = text.indexOf('{')
  if (startIndex === -1) {
    return null
  }

  // Find matching closing brace
  let depth = 0
  let inString = false
  let escape = false

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\') {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        const candidate = text.substring(startIndex, i + 1)
        try {
          // Validate it's actually JSON
          JSON.parse(candidate)
          return candidate
        } catch {
          // Not valid JSON, keep looking
          return null
        }
      }
    }
  }

  return null
}
