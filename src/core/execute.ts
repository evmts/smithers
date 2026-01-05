import type { ReactElement } from 'react'
import type {
  ExecuteOptions,
  ExecutionResult,
  FrameResult,
  PluNode,
  Tool,
} from './types.js'
import { createRoot, renderPlan } from './render.js'

/**
 * Execute a plan using the Ralph Wiggum loop
 *
 * The Ralph Wiggum loop repeatedly:
 * 1. Renders the plan from current state
 * 2. Finds nodes ready to execute
 * 3. Executes those nodes
 * 4. If onFinished callbacks trigger state changes, re-render
 * 5. Repeats until no more executable nodes or max frames reached
 */
export async function executePlan(
  element: ReactElement,
  options: ExecuteOptions = {}
): Promise<ExecutionResult> {
  const {
    maxFrames = 100,
    timeout = 300000,
    verbose = false,
    onPlan,
    onFrame,
  } = options

  const history: FrameResult[] = []
  const startTime = Date.now()
  const root = createRoot()

  let frameNumber = 0
  let finalOutput: unknown = null
  const mcpServers = new Set<string>()

  // Ralph Wiggum loop: keep rendering and executing until done
  while (frameNumber < maxFrames) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      throw new Error(`Execution timeout after ${timeout}ms`)
    }

    frameNumber++
    const frameStart = Date.now()

    // Render the current state to a tree
    const tree = root.render(element)

    // Find nodes that need execution
    const pendingNodes = findPendingExecutables(tree)

    if (verbose) {
      console.log(`[Frame ${frameNumber}] Found ${pendingNodes.length} pending nodes`)
    }

    // If no nodes to execute, we're done
    if (pendingNodes.length === 0) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] No more pending nodes, execution complete`)
      }
      break
    }

    // Serialize to XML for logging
    const plan = await renderPlan(element)

    if (onPlan) {
      onPlan(plan, frameNumber)
    }

    // Execute pending nodes
    // Sequential: execute claude nodes one at a time
    // Parallel: execute all subagent nodes concurrently
    const claudeNodes = pendingNodes.filter((n) => n.type === 'claude')
    const subagentNodes = pendingNodes.filter((n) => n.type === 'subagent')

    const executedNodeTypes: string[] = []
    let stateChanged = false

    // Execute first claude node (if any) and all subagents in parallel
    const toExecute = [
      ...(claudeNodes.length > 0 ? [claudeNodes[0]] : []),
      ...subagentNodes,
    ]

    if (verbose && toExecute.length > 0) {
      console.log(`[Frame ${frameNumber}] Executing ${toExecute.map((n) => n.type).join(', ')}`)
    }

    // Track if any onFinished callbacks were called (indicates state change)
    const originalCallbacks = toExecute.map((node) => node.props.onFinished)
    const wrappedNodes = toExecute.map((node, i) => {
      const originalOnFinished = originalCallbacks[i]
      if (originalOnFinished) {
        node.props.onFinished = (output: unknown) => {
          stateChanged = true
          // Store the output from the last/only node
          finalOutput = output
          ;(originalOnFinished as (output: unknown) => void)(output)
        }
      } else {
        // Even if no onFinished callback, capture the execution result
        const originalExecute = executeNode
        return node
      }
      return node
    })

    // Execute nodes and capture results
    await Promise.all(
      wrappedNodes.map(async (node) => {
        await executeNode(node)
        // If no onFinished, still capture the result
        if (!node.props.onFinished && node._execution?.result) {
          finalOutput = node._execution.result
        }
        // Track MCP servers from tools
        if (node.props.tools && Array.isArray(node.props.tools)) {
          for (const tool of node.props.tools as Tool[]) {
            mcpServers.add(tool.name)
          }
        }
      })
    )

    executedNodeTypes.push(...toExecute.map((n) => n.type))

    const frameResult: FrameResult = {
      frame: frameNumber,
      plan,
      executedNodes: executedNodeTypes,
      stateChanges: stateChanged,
      duration: Date.now() - frameStart,
    }

    history.push(frameResult)

    if (onFrame) {
      onFrame(frameResult)
    }

    // If no state changes and no more pending nodes, we're done
    if (!stateChanged && pendingNodes.length === toExecute.length) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] No state changes, execution complete`)
      }
      break
    }
  }

  root.unmount()

  if (frameNumber >= maxFrames) {
    throw new Error(`Max frames (${maxFrames}) reached`)
  }

  return {
    output: finalOutput,
    frames: frameNumber,
    totalDuration: Date.now() - startTime,
    history,
    mcpServers: Array.from(mcpServers),
  }
}

/**
 * Find nodes that are ready for execution
 */
export function findPendingExecutables(tree: PluNode): PluNode[] {
  const executables: PluNode[] = []

  function walk(node: PluNode) {
    if (
      (node.type === 'claude' || node.type === 'subagent') &&
      (!node._execution || node._execution.status === 'pending')
    ) {
      executables.push(node)
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(tree)
  return executables
}

/**
 * Execute a single node
 *
 * STUB: Will call Claude SDK in a future implementation
 * For now, returns a mock response based on the prompt
 */
export async function executeNode(node: PluNode): Promise<void> {
  node._execution = {
    status: 'running',
  }

  // Check for onError callback to simulate error handling
  const onError = node.props.onError as ((error: Error) => void) | undefined

  try {
    // STUB: Create a mock response based on the prompt content
    // In the real implementation, this will call the Claude SDK
    const promptText = extractTextContent(node)

    let mockOutput: string = 'Hello, I am Plue! A React-based framework for AI agent prompts.'

    // Check if we should return JSON
    // Look for JSON keywords, JSON objects (curly braces), or outputFormat/output-format children
    const hasJsonIndicator =
      promptText.includes('JSON') ||
      promptText.includes('json') ||
      promptText.includes('JSON.stringify') ||
      promptText.match(/\{[^}]*\}/) !== null || // Contains a JSON object
      node.props.outputFormat ||
      hasChildOfType(node, 'output-format')

    if (hasJsonIndicator) {
      // Try to extract JSON from the prompt if it contains a JSON object
      // Look for patterns like JSON.stringify({ ... }) or just { ... }
      const jsonStringifyMatch = promptText.match(/JSON\.stringify\((\{[^}]*\})\)/)
      if (jsonStringifyMatch) {
        // Return the JSON object that was stringified
        mockOutput = jsonStringifyMatch[1]
      } else {
        // Look for a JSON object directly in the prompt
        const jsonObjectMatch = promptText.match(/\{[^}]*\}/)
        if (jsonObjectMatch) {
          mockOutput = jsonObjectMatch[0]
        } else {
          // Default JSON response
          mockOutput = JSON.stringify({
            issues: [],
            summary: 'No issues found',
            status: 'complete',
          })
        }
      }
    }

    node._execution = {
      status: 'complete',
      result: mockOutput,
    }

    // Call onFinished if present
    const onFinished = node.props.onFinished as ((output: unknown) => void) | undefined
    if (onFinished) {
      onFinished(mockOutput)
    }
  } catch (error) {
    node._execution = {
      status: 'error',
      error: error as Error,
    }

    if (onError) {
      onError(error as Error)
    } else {
      throw error
    }
  }
}

/**
 * Check if a node has a child of a specific type
 */
function hasChildOfType(node: PluNode, type: string): boolean {
  for (const child of node.children) {
    if (child.type === type) {
      return true
    }
    if (hasChildOfType(child, type)) {
      return true
    }
  }
  return false
}

/**
 * Extract text content from a node's children
 */
function extractTextContent(node: PluNode): string {
  let text = ''

  if (node.type === 'TEXT') {
    return String(node.props.value ?? '')
  }

  for (const child of node.children) {
    text += extractTextContent(child)
  }

  // Also include children prop if it's a string
  if (typeof node.props.children === 'string') {
    text += node.props.children
  }

  return text
}
