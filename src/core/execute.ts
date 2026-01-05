import { cloneElement, createElement, type ReactElement } from 'react'
import type {
  ExecuteOptions,
  ExecutionResult,
  ExecutionState,
  FrameResult,
  PluNode,
  Tool,
} from './types.js'
import { createRoot } from './render.js'
import { runWithSyncUpdates, waitForStateUpdates } from '../reconciler/index.js'
import { executeWithClaude } from './claude-executor.js'

/**
 * Wrapper component that passes through children
 * We clone the child element to force React to re-evaluate it on every render
 * This ensures useState updates are properly processed
 */
function RenderFrame({ children, frameCount }: { children: ReactElement; frameCount: number }) {
  // Clone the element to create a new reference, forcing React to re-evaluate
  // But DON'T change the key - that would remount and lose state
  return cloneElement(children)
}

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

  // We'll track execution state externally to persist across renders
  const executionState = new Map<string, ExecutionState>()

  // Create root once and reuse it - this preserves React state (useState, etc.)
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

    if (verbose) {
      console.log(`[Frame ${frameNumber}] Rendering element...`)
    }

    // Wrap element in RenderFrame with changing frameCount prop
    // This forces React to recognize this as a new render cycle while preserving state
    const wrapped = createElement(RenderFrame, { frameCount: frameNumber, children: element })
    const tree = await root.render(wrapped)

    if (verbose) {
      console.log(`[Frame ${frameNumber}] Raw tree structure:`)
      console.log(`[Frame ${frameNumber}]   root.type: ${tree.type}`)
      console.log(`[Frame ${frameNumber}]   root.children.length: ${tree.children.length}`)
      if (tree.children.length > 0) {
        const firstChild = tree.children[0]
        console.log(`[Frame ${frameNumber}]   first child.type: ${firstChild.type}`)
        console.log(`[Frame ${frameNumber}]   first child.children.length: ${firstChild.children.length}`)
        if (firstChild.children.length > 0) {
          console.log(`[Frame ${frameNumber}]   first grandchild.type: ${firstChild.children[0].type}`)
        }
      }
    }

    // Restore execution state from previous frames
    // This allows us to preserve execution status across re-renders
    restoreExecutionState(tree, executionState)

    if (verbose) {
      const firstChild = tree.children[0]
      console.log(`[Frame ${frameNumber}] After restore, first child type: ${firstChild?.type}`)
    }

    // Find nodes that need execution
    const pendingNodes = findPendingExecutables(tree)

    if (verbose) {
      console.log(`[Frame ${frameNumber}] Found ${pendingNodes.length} pending nodes`)
      for (const node of pendingNodes) {
        const contentHash = computeContentHash(node)
        console.log(`[Frame ${frameNumber}]   - ${node.type}, onFinished: ${node.props.onFinished}, typeof: ${typeof node.props.onFinished}, _execution: ${node._execution?.status || 'none'}, hash: ${contentHash.substring(0, 20)}...`)
        console.log(`[Frame ${frameNumber}]     props keys: ${Object.keys(node.props).join(', ')}`)
      }
    }

    // If no nodes to execute, we're done
    if (pendingNodes.length === 0) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] No more pending nodes, execution complete`)
      }
      break
    }

    // Serialize the current tree to XML for logging
    // Don't call renderPlan() as it would create a new root and re-render
    const { serialize } = await import('./render.js')
    const plan = serialize(tree)

    if (onPlan) {
      onPlan(plan, frameNumber)
    }

    // Execute ALL pending nodes in this frame
    // Strategy:
    // - Execute ALL claude nodes (they run sequentially, one per iteration)
    // - Execute ALL subagent nodes in parallel
    // This ensures we don't loop forever when there are multiple static claude nodes
    const claudeNodes = pendingNodes.filter((n) => n.type === 'claude')
    const subagentNodes = pendingNodes.filter((n) => n.type === 'subagent')

    const executedNodeTypes: string[] = []
    let stateChanged = false
    let shouldRerender = false

    // For Claude nodes: execute them one at a time, checking for state changes
    // after each one. If state changes, break and re-render.
    for (const claudeNode of claudeNodes) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] Executing claude node`)
      }

      const originalCallback = claudeNode.props.onFinished
      const originalError = claudeNode.props.onError
      let callbackInvoked = false

      const wrappedCallback = originalCallback
        ? (output: unknown) => {
            if (verbose) {
              console.log(`[Frame ${frameNumber}] onFinished called, marking stateChanged=true`)
            }
            callbackInvoked = true
            stateChanged = true
            finalOutput = output
            runWithSyncUpdates(() => {
              ;(originalCallback as (output: unknown) => void)(output)
            })
          }
        : undefined

      const wrappedError = originalError
        ? (error: Error) => {
            if (verbose) {
              console.log(`[Frame ${frameNumber}] onError called, marking stateChanged=true`)
            }
            callbackInvoked = true
            stateChanged = true
            finalOutput = error
            runWithSyncUpdates(() => {
              ;(originalError as (error: Error) => void)(error)
            })
          }
        : undefined

      await executeNode(claudeNode, wrappedCallback, wrappedError)

      if (!originalCallback && claudeNode._execution?.result) {
        finalOutput = claudeNode._execution.result
      }

      // Track MCP servers
      if (claudeNode.props.tools && Array.isArray(claudeNode.props.tools)) {
        for (const tool of claudeNode.props.tools as Tool[]) {
          mcpServers.add(tool.name)
        }
      }

      executedNodeTypes.push('claude')

      // If this node's callback was called and likely changed state,
      // wait for state updates to propagate, then break and re-render
      if (callbackInvoked) {
        shouldRerender = true
        if (verbose) {
          console.log(`[Frame ${frameNumber}] Callback invoked, waiting for state updates to propagate`)
        }
        await waitForStateUpdates()

        // Don't call root.render() here - just let the main loop handle it
        // Breaking here will cause the loop to continue to the next frame
        // where root.render() will be called with a new frameCount, triggering React to process useState updates
        break
      }
    }

    // Execute all subagent nodes in parallel
    if (subagentNodes.length > 0 && !shouldRerender) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] Executing ${subagentNodes.length} subagent nodes in parallel`)
      }

      await Promise.all(
        subagentNodes.map(async (node) => {
          const originalCallback = node.props.onFinished
          const originalError = node.props.onError

          const wrappedCallback = originalCallback
            ? (output: unknown) => {
                if (verbose) {
                  console.log(`[Frame ${frameNumber}] Subagent onFinished called`)
                }
                stateChanged = true
                finalOutput = output
                runWithSyncUpdates(() => {
                  ;(originalCallback as (output: unknown) => void)(output)
                })
              }
            : undefined

          const wrappedError = originalError
            ? (error: Error) => {
                if (verbose) {
                  console.log(`[Frame ${frameNumber}] Subagent onError called`)
                }
                stateChanged = true
                finalOutput = error
                runWithSyncUpdates(() => {
                  ;(originalError as (error: Error) => void)(error)
                })
              }
            : undefined

          await executeNode(node, wrappedCallback, wrappedError)

          if (!originalCallback && node._execution?.result) {
            finalOutput = node._execution.result
          }

          // Track MCP servers
          if (node.props.tools && Array.isArray(node.props.tools)) {
            for (const tool of node.props.tools as Tool[]) {
              mcpServers.add(tool.name)
            }
          }

          executedNodeTypes.push('subagent')
        })
      )
    }

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

    // If no state changes detected, check if there are still more pending nodes
    // If yes, continue to execute them in the next iteration of the loop
    // If no, we're done
    if (!stateChanged) {
      // Re-check for pending nodes after execution
      const remainingPending = findPendingExecutables(tree)
      if (remainingPending.length === 0) {
        if (verbose) {
          console.log(`[Frame ${frameNumber}] No state changes and no remaining nodes, execution complete`)
        }
        break
      } else {
        if (verbose) {
          console.log(`[Frame ${frameNumber}] No state changes but ${remainingPending.length} nodes still pending, continuing`)
        }
        // Continue to next iteration to execute remaining nodes
      }
    } else {
      // If state changed, continue to next frame to re-render
      if (verbose) {
        console.log(`[Frame ${frameNumber}] State changed, will continue to next frame`)
      }
    }

    // Save execution state for next frame
    saveExecutionState(tree, executionState)
  }

  // Unmount the root after we're done
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
 * Save execution state from a tree to external storage
 */
function saveExecutionState(tree: PluNode, storage: Map<string, ExecutionState>): void {
  function walk(node: PluNode, path: string[] = []) {
    const nodePath = [...path, node.type].join('/')

    if ((node.type === 'claude' || node.type === 'subagent') && node._execution) {
      // Use content hash as key for more stable tracking
      const key = node._execution.contentHash || nodePath
      storage.set(key, node._execution)
    }

    node.children.forEach((child, i) => walk(child, [...path, `${node.type}[${i}]`]))
  }

  walk(tree)
}

/**
 * Restore execution state from external storage to a tree
 */
function restoreExecutionState(tree: PluNode, storage: Map<string, ExecutionState>): void {
  function walk(node: PluNode) {
    if (node.type === 'claude' || node.type === 'subagent') {
      // Try to find execution state by content hash
      const contentHash = computeContentHash(node)
      const savedState = storage.get(contentHash)
      if (savedState) {
        node._execution = savedState
      }
    }

    node.children.forEach(child => walk(child))
  }

  walk(tree)
}

/**
 * Find nodes that are ready for execution
 */
export function findPendingExecutables(tree: PluNode): PluNode[] {
  const executables: PluNode[] = []

  function walk(node: PluNode) {
    if (node.type === 'claude' || node.type === 'subagent') {
      // A node is pending if:
      // 1. It has no execution status, OR
      // 2. Its execution status is explicitly 'pending', OR
      // 3. Its content has changed since last execution (detect by comparing children)
      if (!node._execution || node._execution.status === 'pending') {
        executables.push(node)
      } else if (node._execution.status === 'complete' || node._execution.status === 'error') {
        // Check if content changed by computing a simple hash of children
        const currentContentHash = computeContentHash(node)
        if (node._execution.contentHash !== currentContentHash) {
          // Content changed, need to re-execute
          delete node._execution
          executables.push(node)
        }
      }
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(tree)
  return executables
}

/**
 * Compute a simple hash of a node's content for change detection
 */
function computeContentHash(node: PluNode): string {
  // Hash based on: node type, props (excluding functions), and children structure
  const parts: string[] = [node.type]

  // Add props (excluding functions and React internals)
  for (const [key, value] of Object.entries(node.props)) {
    if (typeof value !== 'function' && key !== 'children' && !key.startsWith('_')) {
      parts.push(`${key}:${JSON.stringify(value)}`)
    }
  }

  // Add children (recursively)
  for (const child of node.children) {
    if (child.type === 'TEXT') {
      parts.push(`text:${child.props.value}`)
    } else {
      parts.push(computeContentHash(child))
    }
  }

  return parts.join('|')
}

/**
 * Execute a single node
 *
 * Calls the Claude API via the Anthropic SDK, or uses mock mode for testing.
 *
 * @param node The node to execute
 * @param onFinishedOverride Optional callback to use instead of node.props.onFinished
 * @param onErrorOverride Optional callback to use instead of node.props.onError
 */
export async function executeNode(
  node: PluNode,
  onFinishedOverride?: (output: unknown) => void,
  onErrorOverride?: (error: Error) => void
): Promise<void> {
  // Compute content hash for change detection
  const contentHash = computeContentHash(node)

  node._execution = {
    status: 'running',
    contentHash,
  }

  // Check for onError callback
  const onError =
    onErrorOverride || (node.props.onError as ((error: Error) => void) | undefined)

  try {
    let output: string

    // Check if we should use mock mode (for testing or when no API key is available)
    // Mock mode is enabled if:
    // - SMITHERS_MOCK_MODE is "true"
    // - node.props._mockMode is true
    // - No API key is present and SMITHERS_REAL_MODE is not set
    const apiKeyAvailable = Boolean(process.env.ANTHROPIC_API_KEY)
    const explicitMock =
      process.env.SMITHERS_MOCK_MODE === 'true' ||
      node.props._mockMode === true
    const explicitReal =
      process.env.SMITHERS_MOCK_MODE === 'false' ||
      process.env.SMITHERS_REAL_MODE === 'true'

    const useMockMode = explicitMock || (!explicitReal && !apiKeyAvailable)

    if (!apiKeyAvailable && explicitReal) {
      throw new Error(
        'ANTHROPIC_API_KEY not found. Set it in your environment or disable SMITHERS_REAL_MODE.'
      )
    }

    if (useMockMode) {
      // Use mock executor for testing
      output = await executeMock(node)
    } else {
      // Use real Claude SDK
      output = await executeWithClaude(node)
    }

    // Store the raw output
    node._execution = {
      status: 'complete',
      result: output,
      contentHash,
    }

    // Use override callback if provided, otherwise use node's callback
    const onFinished = onFinishedOverride || (node.props.onFinished as ((output: unknown) => void) | undefined)
    if (onFinished) {
      let outputToPass: unknown = output

      // Try to parse JSON for onFinished callback
      if (typeof output === 'string') {
        try {
          outputToPass = JSON.parse(output)
        } catch {
          // Not JSON, pass as string
          outputToPass = output
        }
      }

      onFinished(outputToPass)
    }
  } catch (error) {
    node._execution = {
      status: 'error',
      error: error as Error,
      contentHash,
    }

    if (onError) {
      onError(error as Error)
    } else {
      throw error
    }
  }
}

/**
 * Execute a node in mock mode (for testing)
 *
 * Returns a mock response based on the prompt content
 */
async function executeMock(node: PluNode): Promise<string> {
  const promptText = extractTextContent(node)

  // Simulate intentional failures for testing
  if (
    promptText.toLowerCase().includes('fail intentionally') ||
    promptText.toLowerCase().includes('will fail')
  ) {
    throw new Error('Simulated failure for testing')
  }

  let mockOutput: string = 'Hello, I am Smithers! A React-based framework for AI agent prompts.'

  // Check if we should return JSON
  // Look for JSON keywords, JSON objects (curly braces), or outputFormat/output-format children
  const hasJsonIndicator =
    promptText.includes('JSON') ||
    promptText.includes('json') ||
    promptText.includes('JSON.stringify') ||
    promptText.match(/\{[^}]*\}/) !== null || // Contains a JSON object
    node.props.outputFormat ||
    hasChildOfType(node, 'output-format') ||
    promptText.toLowerCase().includes('return') // "Return a plan", "Return exactly:", etc.

  if (hasJsonIndicator) {
    // Try to extract JSON from the prompt if it contains a JSON object
    // Look for patterns like JSON.stringify({ ... }) or just { ... }
    const jsonStringifyMatch = promptText.match(/JSON\.stringify\((\{.*?\})\)/)
    if (jsonStringifyMatch) {
      // Return the JSON object that was stringified
      mockOutput = jsonStringifyMatch[1]
    } else {
      // Look for a JSON object directly in the prompt
      // Use a more robust approach to find JSON objects that handles nested structures
      const extracted = extractJsonFromText(promptText)
      if (extracted) {
        mockOutput = extracted
      } else {
        // Infer what kind of JSON to return based on prompt content
        if (promptText.toLowerCase().includes('subtask')) {
          mockOutput = JSON.stringify({
            subtasks: ['task1', 'task2'],
          })
        } else {
          // Default JSON response
          mockOutput = JSON.stringify({
            issues: [],
            summary: 'No issues found',
            status: 'complete',
            result: 'success',
          })
        }
      }
    }
  }

  return mockOutput
}

/**
 * Extract a JSON object from text by finding matching braces
 * This handles nested structures properly
 */
function extractJsonFromText(text: string): string | null {
  const startIndex = text.indexOf('{')
  if (startIndex === -1) {
    return null
  }

  let braceCount = 0
  let inString = false
  let escapeNext = false

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') {
        braceCount++
      } else if (char === '}') {
        braceCount--
        if (braceCount === 0) {
          // Found matching closing brace
          const jsonStr = text.substring(startIndex, i + 1)
          // Validate it's actual JSON
          try {
            JSON.parse(jsonStr)
            return jsonStr
          } catch {
            // Not valid JSON, continue searching
            continue
          }
        }
      }
    }
  }

  return null
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
