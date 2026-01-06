import { cloneElement, createElement, type ReactElement } from 'react'
import type {
  ExecuteOptions,
  ExecutionError,
  ExecutionResult,
  ExecutionState,
  FrameResult,
  HumanPromptInfo,
  HumanPromptResponse,
  PlanInfo,
  SmithersNode,
  Tool,
} from './types.js'
import { createRoot } from './render.js'
import { runWithSyncUpdates, waitForStateUpdates } from '../reconciler/index.js'
import { executeWithClaude, createExecutionError, getNodePath } from './claude-executor.js'
import { executeWithClaudeCli } from './claude-cli-executor.js'
import { executeWithAgentSdk, executeAgentMock } from './claude-agent-executor.js'
import {
  separatePromptAndPlan,
  serializePlanWithPaths,
  getExecutableNodePaths,
} from './nested-execution.js'
import { MCPManager } from '../mcp/manager.js'
import type { MCPServerConfig } from '../mcp/types.js'
import { DebugCollector } from '../debug/collector.js'
import type { ExecutionStatus } from '../debug/types.js'
import {
  findWorkflowOutputs,
  zodSchemaToToolSchema,
  getWorkflowStoreFromTree,
} from '../workflow/helpers.js'

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
    mockMode = false,
    onPlan,
    onFrame,
    onHumanPrompt,
    onPlanWithPrompt,
    debug,
  } = options

  // Initialize debug collector
  const debugCollector = new DebugCollector(debug)

  const history: FrameResult[] = []
  const startTime = Date.now()

  // We'll track execution state externally to persist across renders
  const executionState = new Map<string, ExecutionState>()

  // Track which Human nodes have been approved (by node path)
  // This prevents infinite prompting when a Human node has no onApprove callback
  const approvedHumanNodes = new Set<string>()

  // Create root once and reuse it - this preserves React state (useState, etc.)
  const root = createRoot()

  // Initialize MCP manager for tool discovery
  const mcpManager = new MCPManager()

  let frameNumber = 0
  let finalOutput: unknown = null
  const mcpServers = new Set<string>()
  let tree: SmithersNode

  // Ralph Wiggum loop: keep rendering and executing until done
  while (frameNumber < maxFrames) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      debugCollector.emit({ type: 'loop:terminated', reason: 'timeout' })
      throw new Error(`Execution timeout after ${timeout}ms`)
    }

    frameNumber++
    const frameStart = Date.now()
    debugCollector.setFrame(frameNumber)
    debugCollector.emit({ type: 'frame:start' })

    if (verbose) {
      console.log(`[Frame ${frameNumber}] Rendering element...`)
    }

    // Wrap element in RenderFrame with changing frameCount prop
    // This forces React to recognize this as a new render cycle while preserving state
    const wrapped = createElement(RenderFrame, { frameCount: frameNumber, children: element })
    tree = await root.render(wrapped)

    // Emit frame:render event with optional tree snapshot
    debugCollector.emit({
      type: 'frame:render',
      treeSnapshot: debugCollector.includeTreeSnapshots
        ? debugCollector.createTreeSnapshot(tree)
        : undefined,
    })

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

    // Execute Worktree nodes FIRST - setup git worktrees before any other operations
    const pendingWorktreeNodes = findPendingWorktreeNodes(tree)
    if (pendingWorktreeNodes.length > 0) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] Found ${pendingWorktreeNodes.length} pending worktree nodes`)
      }

      for (const worktreeNode of pendingWorktreeNodes) {
        const nodePath = getNodePath(worktreeNode)

        debugCollector.emit({
          type: 'node:execute:start',
          nodePath,
          nodeType: 'worktree',
          contentHash: computeContentHash(worktreeNode),
        })

        const execStart = Date.now()
        await executeWorktreeNode(worktreeNode, mockMode)

        debugCollector.emit({
          type: 'node:execute:end',
          nodePath,
          nodeType: 'worktree',
          duration: Date.now() - execStart,
          status: worktreeNode._execution?.status === 'error' ? 'error' : 'complete',
          result: worktreeNode._execution?.result,
          error: worktreeNode._execution?.error?.message,
        })

        // If onCreated callback triggered state change, we need to re-render
        const onCreated = worktreeNode.props.onCreated
        if (onCreated && worktreeNode._execution?.status === 'complete') {
          await waitForStateUpdates()
        }
      }
    }

    // Execute File nodes BEFORE checking for Stop
    // This ensures files are written even when Stop is in the tree
    const pendingFileNodes = findPendingFileNodes(tree)
    if (pendingFileNodes.length > 0) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] Found ${pendingFileNodes.length} pending file nodes`)
      }

      // File writes should NOT be affected by Claude mock mode
      // Only skip writes if explicitly set on the File component itself
      const useFileMockMode = false

      for (const fileNode of pendingFileNodes) {
        const nodePath = getNodePath(fileNode)

        debugCollector.emit({
          type: 'node:execute:start',
          nodePath,
          nodeType: 'file',
          contentHash: computeContentHash(fileNode),
        })

        const execStart = Date.now()
        await executeFileNode(fileNode, useFileMockMode)

        debugCollector.emit({
          type: 'node:execute:end',
          nodePath,
          nodeType: 'file',
          duration: Date.now() - execStart,
          status: fileNode._execution?.status === 'error' ? 'error' : 'complete',
          result: fileNode._execution?.result,
          error: fileNode._execution?.error?.message,
        })

        // If onWritten callback triggered state change, we need to re-render
        const onWritten = fileNode.props.onWritten
        if (onWritten && fileNode._execution?.status === 'complete') {
          await waitForStateUpdates()
        }
      }
    }

    // Check for Stop node - if present, halt the loop
    const stopNode = findStopNode(tree)
    if (stopNode) {
      const reason = stopNode.props.reason as string | undefined
      debugCollector.emit({ type: 'control:stop', reason })
      if (verbose) {
        console.log(`[Frame ${frameNumber}] Stop node detected${reason ? `: ${reason}` : ''}, halting execution`)
      }
      debugCollector.emit({ type: 'loop:terminated', reason: 'stop_node' })
      break
    }

    // Check for Human node - if present, wait for human approval
    // Pass approvedHumanNodes to find the first *unapproved* Human node
    const humanNode = findHumanNode(tree, approvedHumanNodes)
    if (humanNode) {
      // Use a combination of path and content hash to uniquely identify this Human node
      // This allows different Human nodes at the same tree position to be treated separately
      const humanNodePath = getNodePath(humanNode)
      const humanContentHash = computeContentHash(humanNode)
      const humanNodeKey = `${humanNodePath}:${humanContentHash}`

      // If we found a Human node from findHumanNode with approvedHumanNodes passed,
      // it's guaranteed to be unapproved, so we can proceed directly
      {
        const message = (humanNode.props.message as string | undefined) || 'Human approval required to continue'
        const content = extractTextContent(humanNode)

        // Check for workflow-output children
        const humanOutputs = findWorkflowOutputs(humanNode)
        const hasWorkflowOutputs = humanOutputs.length > 0

        debugCollector.emit({
          type: 'control:human',
          message,
          nodePath: humanNodePath,
          approved: undefined, // Will be updated after decision
        })

        if (verbose) {
          console.log(`[Frame ${frameNumber}] Human node detected: ${message}`)
          if (hasWorkflowOutputs) {
            console.log(`[Frame ${frameNumber}] Human node has ${humanOutputs.length} workflow outputs`)
          }
        }

        // If onHumanPrompt callback is provided, use it; otherwise auto-approve
        let approved = true
        let workflowValues: Record<string, unknown> | undefined

        if (onHumanPrompt) {
          // Always build HumanPromptInfo for consistent handling
          const promptInfo: HumanPromptInfo = {
            message,
            content,
            outputs: humanOutputs.map((o) => ({
              name: o.props.name as string,
              description: o.props.description as string | undefined,
              schema: o.props.schema ? zodSchemaToToolSchema(o.props.schema) : undefined,
            })),
          }

          // Detect callback signature by checking parameter count
          // Legacy callbacks accept 2 parameters: (message, content)
          // Enhanced callbacks accept 1 parameter: (info)
          const isLegacyCallback = onHumanPrompt.length >= 2

          // Call the onHumanPrompt callback
          let result: boolean | HumanPromptResponse

          if (isLegacyCallback) {
            // Legacy callback: pass (message, content) and expect boolean
            result = await (onHumanPrompt as (
              message: string,
              content: string
            ) => Promise<boolean>)(promptInfo.message, promptInfo.content)
          } else {
            // Enhanced callback: pass HumanPromptInfo and handle response
            result = await (onHumanPrompt as (
              info: HumanPromptInfo
            ) => Promise<boolean | HumanPromptResponse>)(promptInfo)
          }

          if (typeof result === 'boolean') {
            // Legacy callback: returns boolean
            approved = result
          } else {
            // Enhanced callback: returns HumanPromptResponse
            approved = result.approved
            workflowValues = result.values
          }
        }

        if (approved) {
          // Mark this Human node as approved
          approvedHumanNodes.add(humanNodeKey)

          // Set workflow values from human response
          if (workflowValues && hasWorkflowOutputs) {
            const store = getWorkflowStoreFromTree(humanNode)
            if (store) {
              for (const [name, value] of Object.entries(workflowValues)) {
                store.setValue(name, value)
              }
              if (verbose) {
                console.log(`[Frame ${frameNumber}] Set ${Object.keys(workflowValues).length} workflow values from human response`)
              }
            }
          }

          debugCollector.emit({
            type: 'control:human',
            message,
            nodePath: humanNodePath,
            approved: true,
          })

          // Call onApprove callback if provided
          const onApprove = humanNode.props.onApprove as (() => void) | undefined
          if (onApprove) {
            debugCollector.emit({
              type: 'callback:invoked',
              callbackName: 'onApprove',
              nodePath: humanNodePath,
            })
            if (verbose) {
              console.log(`[Frame ${frameNumber}] Human approved, calling onApprove callback`)
            }
            runWithSyncUpdates(() => {
              onApprove()
            })
            await waitForStateUpdates()
            // Continue to next frame to re-render with updated state
            continue
          } else {
            // No onApprove callback, but approval is tracked.
            // Continue to next frame to check for more Human nodes or pending executables
            if (verbose) {
              console.log(`[Frame ${frameNumber}] Human approved without callback, continuing to next frame`)
            }
            continue
          }
        } else {
          debugCollector.emit({
            type: 'control:human',
            message,
            nodePath: humanNodePath,
            approved: false,
          })

          // Call onReject callback if provided
          const onReject = humanNode.props.onReject as (() => void) | undefined
          if (onReject) {
            debugCollector.emit({
              type: 'callback:invoked',
              callbackName: 'onReject',
              nodePath: humanNodePath,
            })
            if (verbose) {
              console.log(`[Frame ${frameNumber}] Human rejected, calling onReject callback`)
            }
            runWithSyncUpdates(() => {
              onReject()
            })
            await waitForStateUpdates()
            // Continue to next frame to re-render with updated state
            continue
          }
          // If rejected and no callback, halt execution
          if (verbose) {
            console.log(`[Frame ${frameNumber}] Human approval rejected, halting execution`)
          }
          debugCollector.emit({ type: 'loop:terminated', reason: 'human_rejected' })
          break
        }
      }
    }

    // Find nodes that need execution
    const pendingNodes = findPendingExecutables(tree)

    // Emit node:found events for each pending node
    for (const node of pendingNodes) {
      const contentHash = computeContentHash(node)
      debugCollector.emit({
        type: 'node:found',
        nodePath: getNodePath(node),
        nodeType: node.type,
        contentHash,
        status: (node._execution?.status || 'pending') as ExecutionStatus,
      })
    }

    if (verbose) {
      console.log(`[Frame ${frameNumber}] Found ${pendingNodes.length} pending nodes`)
      for (const node of pendingNodes) {
        const contentHash = computeContentHash(node)
        console.log(`[Frame ${frameNumber}]   - ${node.type}, onFinished: ${node.props.onFinished}, typeof: ${typeof node.props.onFinished}, _execution: ${node._execution?.status || 'none'}, hash: ${contentHash.substring(0, 20)}...`)
        console.log(`[Frame ${frameNumber}]     props keys: ${Object.keys(node.props).join(', ')}`)
      }
    }

    // If no nodes to execute, we're done
    // BUT: if there's an unapproved Human node, we need to keep looping
    // Since findHumanNode now filters by approvedHumanNodes, humanNode is already unapproved if it exists
    const hasUnapprovedHuman = humanNode !== null
    if (pendingNodes.length === 0 && !hasUnapprovedHuman) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] No more pending nodes, execution complete`)
      }
      debugCollector.emit({ type: 'loop:terminated', reason: 'no_pending_nodes' })
      break
    }

    // Serialize the current tree to XML for logging
    // Don't call renderPlan() as it would create a new root and re-render
    const { serialize } = await import('./render.js')
    const plan = serialize(tree)

    if (onPlan) {
      onPlan(plan, frameNumber)
    }

    // Call onPlanWithPrompt if provided
    // This shows Claude the plan + any top-level prompt before execution
    if (onPlanWithPrompt && pendingNodes.length > 0) {
      // Extract top-level prompt and plan from the tree
      // The root is typically a wrapper, so look at its first meaningful child
      const rootChild = tree.children[0]
      if (rootChild) {
        const { prompt, plan: planNodes } = separatePromptAndPlan(rootChild)

        // Only call if there's something meaningful to show
        if (planNodes.length > 0 || prompt) {
          const planXml = planNodes.length > 0
            ? serializePlanWithPaths(planNodes)
            : plan // Fallback to full serialization

          // Compute executable paths from the same source as planXml
          // When planNodes is empty, use pendingNodes to get accurate paths
          const executablePaths = planNodes.length > 0
            ? getExecutableNodePaths(planNodes)
            : pendingNodes.map(node => getNodePath(node))

          const planInfo: PlanInfo = {
            planXml,
            prompt,
            executablePaths,
            frame: frameNumber,
          }

          if (verbose) {
            console.log(`[Frame ${frameNumber}] Calling onPlanWithPrompt with ${executablePaths.length} executable nodes`)
          }

          await onPlanWithPrompt(planInfo)
        }
      }
    }

    // Execute ALL pending nodes in this frame
    // Strategy:
    // - Execute claude nodes (top-level or subagent.parallel=false) sequentially
    // - Execute claude nodes under subagent.parallel=true in parallel
    // This ensures we don't loop forever when there are multiple static claude nodes
    const sequentialNodes: SmithersNode[] = []
    const parallelNodes: SmithersNode[] = []

    for (const node of pendingNodes) {
      const subagent = findAncestorSubagent(node)
      if (subagent) {
        if (subagent.props.parallel === false) {
          sequentialNodes.push(node)
        } else {
          parallelNodes.push(node)
        }
      } else {
        sequentialNodes.push(node)
      }
    }

    const executedNodeTypes: string[] = []
    let stateChanged = false
    let shouldRerender = false

    // For Claude nodes: execute them one at a time, checking for state changes
    // after each one. If state changes, break and re-render.
    for (const claudeNode of sequentialNodes) {
      const nodePath = getNodePath(claudeNode)
      const nodeContentHash = computeContentHash(claudeNode)

      if (verbose) {
        console.log(`[Frame ${frameNumber}] Executing claude node`)
      }

      const originalCallback = claudeNode.props.onFinished
      const originalError = claudeNode.props.onError
      let callbackInvoked = false
      let callbackName: 'onFinished' | 'onError' | undefined

      const wrappedCallback = originalCallback
        ? (output: unknown) => {
            if (verbose) {
              console.log(`[Frame ${frameNumber}] onFinished called, marking stateChanged=true`)
            }
            callbackInvoked = true
            callbackName = 'onFinished'
            stateChanged = true
            finalOutput = output
            debugCollector.emit({
              type: 'callback:invoked',
              callbackName: 'onFinished',
              nodePath,
            })
            debugCollector.emit({
              type: 'state:change',
              source: 'callback',
              nodePath,
              callbackName: 'onFinished',
            })
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
            callbackName = 'onError'
            stateChanged = true
            finalOutput = error
            debugCollector.emit({
              type: 'callback:invoked',
              callbackName: 'onError',
              nodePath,
            })
            debugCollector.emit({
              type: 'state:change',
              source: 'callback',
              nodePath,
              callbackName: 'onError',
            })
            runWithSyncUpdates(() => {
              ;(originalError as (error: Error) => void)(error)
            })
          }
        : undefined

      // Inject worktree path if this node is inside a Worktree component
      const worktreePath = getWorktreePath(claudeNode)
      if (worktreePath && !claudeNode.props.cwd) {
        // Set cwd to worktree path if not already set
        claudeNode.props.cwd = worktreePath
      }

      // Emit node:execute:start
      const execStart = Date.now()
      debugCollector.emit({
        type: 'node:execute:start',
        nodePath,
        nodeType: claudeNode.type,
        contentHash: nodeContentHash,
      })

      const nodeResult = await executeNode(claudeNode, mcpManager, wrappedCallback, wrappedError, options)

      // Emit node:execute:end
      debugCollector.emit({
        type: 'node:execute:end',
        nodePath,
        nodeType: claudeNode.type,
        duration: Date.now() - execStart,
        status: claudeNode._execution?.status === 'error' ? 'error' : 'complete',
        result: claudeNode._execution?.result,
        error: claudeNode._execution?.error?.message,
      })

      if (!originalCallback && claudeNode._execution?.result) {
        finalOutput = claudeNode._execution.result
      }

      // Track MCP servers
      if (claudeNode.props.mcpServers && Array.isArray(claudeNode.props.mcpServers)) {
        for (const config of claudeNode.props.mcpServers as MCPServerConfig[]) {
          mcpServers.add(config.name)
        }
      }

      executedNodeTypes.push(getExecutionLabel(claudeNode))

      // If this node's callback was called or workflow values were set,
      // wait for state updates to propagate, then break and re-render
      if (callbackInvoked || nodeResult.workflowValuesSet) {
        shouldRerender = true
        stateChanged = stateChanged || nodeResult.workflowValuesSet
        if (verbose) {
          if (callbackInvoked) {
            console.log(`[Frame ${frameNumber}] Callback invoked, waiting for state updates to propagate`)
          }
          if (nodeResult.workflowValuesSet) {
            console.log(`[Frame ${frameNumber}] Workflow values set, waiting for state updates to propagate`)
          }
        }
        await waitForStateUpdates()

        // Don't call root.render() here - just let the main loop handle it
        // Breaking here will cause the loop to continue to the next frame
        // where root.render() will be called with a new frameCount, triggering React to process useState updates
        break
      }
    }

    // Execute all subagent nodes in parallel
    if (parallelNodes.length > 0 && !shouldRerender) {
      if (verbose) {
        console.log(`[Frame ${frameNumber}] Executing ${parallelNodes.length} subagent nodes in parallel`)
      }

      await Promise.all(
        parallelNodes.map(async (node) => {
          const nodePath = getNodePath(node)
          const nodeContentHash = computeContentHash(node)
          const originalCallback = node.props.onFinished
          const originalError = node.props.onError

          const wrappedCallback = originalCallback
            ? (output: unknown) => {
                if (verbose) {
                  console.log(`[Frame ${frameNumber}] Subagent onFinished called`)
                }
                stateChanged = true
                finalOutput = output
                debugCollector.emit({
                  type: 'callback:invoked',
                  callbackName: 'onFinished',
                  nodePath,
                })
                debugCollector.emit({
                  type: 'state:change',
                  source: 'callback',
                  nodePath,
                  callbackName: 'onFinished',
                })
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
                debugCollector.emit({
                  type: 'callback:invoked',
                  callbackName: 'onError',
                  nodePath,
                })
                debugCollector.emit({
                  type: 'state:change',
                  source: 'callback',
                  nodePath,
                  callbackName: 'onError',
                })
                runWithSyncUpdates(() => {
                  ;(originalError as (error: Error) => void)(error)
                })
              }
            : undefined

          // Inject worktree path if this node is inside a Worktree component
          const worktreePath = getWorktreePath(node)
          if (worktreePath && !node.props.cwd) {
            // Set cwd to worktree path if not already set
            node.props.cwd = worktreePath
          }

          // Emit node:execute:start
          const execStart = Date.now()
          debugCollector.emit({
            type: 'node:execute:start',
            nodePath,
            nodeType: node.type,
            contentHash: nodeContentHash,
          })

          const nodeResult = await executeNode(node, mcpManager, wrappedCallback, wrappedError, options)

          // Emit node:execute:end
          debugCollector.emit({
            type: 'node:execute:end',
            nodePath,
            nodeType: node.type,
            duration: Date.now() - execStart,
            status: node._execution?.status === 'error' ? 'error' : 'complete',
            result: node._execution?.result,
            error: node._execution?.error?.message,
          })

          // Mark state as changed if workflow values were set
          if (nodeResult.workflowValuesSet) {
            stateChanged = true
            if (verbose) {
              console.log(`[Frame ${frameNumber}] Subagent set workflow values`)
            }
          }

          if (!originalCallback && node._execution?.result) {
            finalOutput = node._execution.result
          }

          // Track MCP servers
          if (node.props.mcpServers && Array.isArray(node.props.mcpServers)) {
            for (const config of node.props.mcpServers as MCPServerConfig[]) {
              mcpServers.add(config.name)
            }
          }

          executedNodeTypes.push(getExecutionLabel(node))
        })
      )
    }

    // Emit frame:end event
    debugCollector.emit({
      type: 'frame:end',
      duration: Date.now() - frameStart,
      stateChanged,
      executedNodes: executedNodeTypes,
    })

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
        debugCollector.emit({ type: 'loop:terminated', reason: 'no_pending_nodes' })
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

  // Disconnect all MCP servers
  await mcpManager.disconnectAll()

  if (frameNumber >= maxFrames) {
    debugCollector.emit({ type: 'loop:terminated', reason: 'max_frames' })
    throw new Error(`Max frames (${maxFrames}) reached`)
  }

  // Clean up all worktrees that were created during execution
  const allWorktreeNodes: SmithersNode[] = []
  function collectWorktrees(node: SmithersNode) {
    if (node.type === 'worktree') {
      allWorktreeNodes.push(node)
    }
    for (const child of node.children) {
      collectWorktrees(child)
    }
  }
  collectWorktrees(tree)

  for (const worktreeNode of allWorktreeNodes) {
    await cleanupWorktreeNode(worktreeNode, mockMode)
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
function saveExecutionState(tree: SmithersNode, storage: Map<string, ExecutionState>): void {
  function walk(node: SmithersNode, path: string[] = []) {
    const nodePath = [...path, node.type].join('/')

    if ((node.type === 'claude' || node.type === 'claude-cli' || node.type === 'subagent') && node._execution) {
      // Use stable node path as key to avoid collisions between identical nodes
      // Ensure contentHash is always set for change detection
      const stateToSave: ExecutionState = {
        ...node._execution,
        contentHash: node._execution.contentHash ?? computeContentHash(node),
      }
      storage.set(nodePath, stateToSave)
    }

    node.children.forEach((child, i) => walk(child, [...path, `${node.type}[${i}]`]))
  }

  walk(tree)
}

/**
 * Restore execution state from external storage to a tree
 */
function restoreExecutionState(tree: SmithersNode, storage: Map<string, ExecutionState>): void {
  function walk(node: SmithersNode, path: string[] = []) {
    const nodePath = [...path, node.type].join('/')

    if (node.type === 'claude' || node.type === 'claude-cli') {
      // Try to find execution state by stable node path
      const savedState = storage.get(nodePath)
      if (savedState) {
        // Verify content hasn't changed by comparing hashes
        const currentHash = computeContentHash(node)
        if (savedState.contentHash === currentHash) {
          node._execution = savedState
        }
        // If content changed, don't restore - let it execute again
      }
    }

    node.children.forEach((child, i) => walk(child, [...path, `${node.type}[${i}]`]))
  }

  walk(tree)
}

/**
 * Check if a Stop node exists in the tree
 *
 * The Stop component signals the Ralph Wiggum loop to halt execution
 * before starting any new agent executions.
 *
 * @returns The Stop node if found, or null if no Stop node exists
 */
export function findStopNode(tree: SmithersNode): SmithersNode | null {
  function walk(node: SmithersNode): SmithersNode | null {
    if (node.type === 'stop') {
      return node
    }

    for (const child of node.children) {
      const found = walk(child)
      if (found) {
        return found
      }
    }

    return null
  }

  return walk(tree)
}

/**
 * Check if a Human node exists in the tree
 *
 * The Human component pauses execution and waits for human approval/input.
 * When encountered, execution should prompt the user before continuing.
 *
 * @param tree The tree to search
 * @param approvedHumanNodes Optional set of approved Human node keys (path:hash) to skip
 * @returns The first unapproved Human node if found, or null if no unapproved Human node exists
 */
export function findHumanNode(tree: SmithersNode, approvedHumanNodes?: Set<string>): SmithersNode | null {
  function walk(node: SmithersNode): SmithersNode | null {
    if (node.type === 'human') {
      // If approvedHumanNodes is provided, check if this node is already approved
      if (approvedHumanNodes) {
        const humanNodePath = getNodePath(node)
        const humanContentHash = computeContentHash(node)
        const humanNodeKey = `${humanNodePath}:${humanContentHash}`

        if (approvedHumanNodes.has(humanNodeKey)) {
          // This Human node is already approved, continue searching for others
          // Don't return, keep walking
        } else {
          // Found an unapproved Human node
          return node
        }
      } else {
        // No filtering, return the first Human node we find
        return node
      }
    }

    for (const child of node.children) {
      const found = walk(child)
      if (found) {
        return found
      }
    }

    return null
  }

  return walk(tree)
}

function findAncestorSubagent(node: SmithersNode): SmithersNode | null {
  let current = node.parent
  while (current) {
    if (current.type === 'subagent') {
      return current
    }
    current = current.parent
  }
  return null
}

function getExecutionLabel(node: SmithersNode): string {
  if (findAncestorSubagent(node)) {
    return 'subagent'
  }
  if (node.type === 'claude-cli') return 'claude-cli'
  if (node.type === 'claude-api') return 'claude-api'
  return 'claude'
}

/**
 * Find pending File nodes that need to be written
 */
export function findPendingFileNodes(tree: SmithersNode): SmithersNode[] {
  const fileNodes: SmithersNode[] = []

  function walk(node: SmithersNode) {
    if (node.type === 'file') {
      if (!node._execution || node._execution.status === 'pending') {
        fileNodes.push(node)
      }
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(tree)
  return fileNodes
}

/**
 * Execute a File node - write content to disk
 */
export async function executeFileNode(
  node: SmithersNode,
  mockMode: boolean = false
): Promise<void> {
  const path = node.props.path as string
  const mode = (node.props.mode as 'write' | 'append') || 'write'
  const encoding = (node.props.encoding as BufferEncoding) || 'utf-8'
  const createDirs = node.props.createDirs !== false // defaults to true
  const onWritten = node.props.onWritten as ((path: string) => void) | undefined
  const onError = node.props.onError as ((error: Error) => void) | undefined
  const nodeMockMode = node.props._mockMode === true

  // Compute content hash for change detection
  const contentHash = computeContentHash(node)

  node._execution = {
    status: 'running',
    contentHash,
  }

  try {
    // Extract text content from children
    const content = extractTextContent(node)

    // In mock mode, skip actual file writes
    if (mockMode || nodeMockMode) {
      node._execution = {
        status: 'complete',
        result: `[mock] Would write to ${path}`,
        contentHash,
      }

      if (onWritten) {
        onWritten(path)
      }
      return
    }

    // Import fs dynamically to avoid bundling issues
    const { writeFileSync, appendFileSync, mkdirSync, existsSync } = await import('fs')
    const { dirname } = await import('path')

    // Create parent directories if needed
    const dir = dirname(path)
    if (createDirs && dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Write or append to file
    if (mode === 'append') {
      appendFileSync(path, content, { encoding })
    } else {
      writeFileSync(path, content, { encoding })
    }

    node._execution = {
      status: 'complete',
      result: path,
      contentHash,
    }

    if (onWritten) {
      onWritten(path)
    }
  } catch (error) {
    node._execution = {
      status: 'error',
      error: error as Error,
      contentHash,
    }

    if (onError) {
      onError(error as Error)
    }
  }
}

/**
 * Find worktree nodes that need to be set up
 */
export function findPendingWorktreeNodes(tree: SmithersNode): SmithersNode[] {
  const worktreeNodes: SmithersNode[] = []

  function walk(node: SmithersNode) {
    if (node.type === 'worktree') {
      if (!node._execution || node._execution.status === 'pending') {
        worktreeNodes.push(node)
      }
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(tree)
  return worktreeNodes
}

/**
 * Execute a Worktree node - create/setup git worktree
 */
export async function executeWorktreeNode(
  node: SmithersNode,
  mockMode: boolean = false
): Promise<void> {
  const path = node.props.path as string
  const branch = node.props.branch as string | undefined
  const baseBranch = node.props.baseBranch as string | undefined
  const cleanup = node.props.cleanup !== false // defaults to true
  const onCreated = node.props.onCreated as ((path: string, branch?: string) => void) | undefined
  const onError = node.props.onError as ((error: Error) => void) | undefined

  // Compute content hash for change detection
  const contentHash = computeContentHash(node)

  node._execution = {
    status: 'running',
    contentHash,
  }

  try {
    // In mock mode, skip actual git operations
    if (mockMode) {
      node._execution = {
        status: 'complete',
        result: { path, branch, cleanup },
        contentHash,
      }

      if (onCreated) {
        onCreated(path, branch)
      }
      return
    }

    // Import child_process dynamically
    const { execFileSync } = await import('child_process')
    const pathModule = await import('path')
    const { existsSync } = await import('fs')

    // Validate branch names to prevent command injection
    const validateBranchName = (name: string) => {
      // Git branch names cannot contain: space, ~, ^, :, ?, *, [, \, .., @{, consecutive dots
      // For safety, we allow alphanumeric, dash, underscore, slash, dot
      // But reject names that start with dash (option injection) or contain dangerous patterns
      if (name.startsWith('-')) {
        throw new Error(`Invalid branch name: ${name}. Branch names cannot start with dash.`)
      }
      if (!/^[a-zA-Z0-9_\-/.]+$/.test(name)) {
        throw new Error(`Invalid branch name: ${name}. Only alphanumeric characters, dash, underscore, slash, and dot are allowed.`)
      }
      // Reject dangerous patterns like .., @{, etc.
      if (name.includes('..') || name.includes('@{') || name.includes('~')) {
        throw new Error(`Invalid branch name: ${name}. Cannot contain .., @{, or ~ patterns.`)
      }
    }

    if (branch) validateBranchName(branch)
    if (baseBranch) validateBranchName(baseBranch)

    // Resolve absolute path
    const absolutePath = pathModule.resolve(path)

    // Check if we're in a git repository
    try {
      execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' })
    } catch {
      throw new Error('Worktree component requires a git repository')
    }

    // Check if worktree already exists
    if (existsSync(absolutePath)) {
      // Check if it's already a worktree for this path
      try {
        const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8' })
        const isWorktree = worktrees.includes(`worktree ${absolutePath}`)

        if (!isWorktree) {
          throw new Error(`Path ${absolutePath} already exists and is not a git worktree`)
        }

        // Verify the worktree is on the correct branch (if specified)
        if (branch) {
          const currentBranch = execFileSync('git', ['-C', absolutePath, 'branch', '--show-current'], {
            encoding: 'utf-8'
          }).trim()

          if (currentBranch !== branch) {
            throw new Error(`Worktree at ${absolutePath} is on branch "${currentBranch}" but expected "${branch}"`)
          }
        }

        // Worktree exists, reuse it
        node._execution = {
          status: 'complete',
          result: { path: absolutePath, branch, cleanup, reused: true },
          contentHash,
        }

        if (onCreated) {
          onCreated(absolutePath, branch)
        }
        return
      } catch (error) {
        // If git worktree list fails or path doesn't match, treat as error
        if (error instanceof Error && error.message.includes('already exists')) {
          throw error
        }
        // Re-throw branch mismatch errors
        if (error instanceof Error && error.message.includes('expected')) {
          throw error
        }
        throw new Error(`Path ${absolutePath} already exists and is not a git worktree`)
      }
    }

    // Create the worktree using execFileSync with array args (prevents injection)
    const args = ['worktree', 'add', absolutePath]

    if (branch) {
      // Check if branch exists
      let branchExists = false
      try {
        execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { stdio: 'ignore' })
        branchExists = true
      } catch {
        branchExists = false
      }

      if (branchExists) {
        // Use existing branch (add -- separator to prevent option injection)
        args.push('--', branch)
      } else {
        // Create new branch
        args.push('-b', branch)
        if (baseBranch) {
          // Add -- separator before baseBranch to prevent option injection
          args.push('--', baseBranch)
        }
      }
    }

    execFileSync('git', args, { stdio: 'pipe' })

    node._execution = {
      status: 'complete',
      result: { path: absolutePath, branch, cleanup, created: true },
      contentHash,
    }

    if (onCreated) {
      onCreated(absolutePath, branch)
    }
  } catch (error) {
    node._execution = {
      status: 'error',
      error: error as Error,
      contentHash,
    }

    if (onError) {
      onError(error as Error)
    }
  }
}

/**
 * Clean up a Worktree node - remove git worktree
 */
export async function cleanupWorktreeNode(
  node: SmithersNode,
  mockMode: boolean = false
): Promise<void> {
  const cleanup = node.props.cleanup !== false // defaults to true
  const onCleanup = node.props.onCleanup as ((path: string) => void) | undefined

  // Skip if cleanup is disabled or node wasn't successfully created
  if (!cleanup || !node._execution || node._execution.status !== 'complete') {
    return
  }

  const result = node._execution.result as { path: string; reused?: boolean } | undefined
  if (!result || result.reused) {
    // Don't clean up reused worktrees
    return
  }

  try {
    // In mock mode, skip actual git operations but don't call onCleanup
    // (onCleanup is only called when real cleanup happens)
    if (mockMode) {
      return
    }

    // Import child_process dynamically
    const { execFileSync } = await import('child_process')

    // Remove the worktree using execFileSync (prevents injection)
    execFileSync('git', ['worktree', 'remove', result.path, '--force'], { stdio: 'pipe' })

    if (onCleanup) {
      onCleanup(result.path)
    }
  } catch (error) {
    // Log cleanup errors but don't throw - execution is already complete
    console.error(`Failed to cleanup worktree at ${result.path}:`, error)
  }
}

/**
 * Find the worktree path for a node by walking up the tree
 * Throws if a parent worktree failed (to block child execution)
 */
export function getWorktreePath(node: SmithersNode): string | null {
  let current: SmithersNode | null = node

  while (current) {
    if (current.type === 'worktree') {
      if (current._execution?.status === 'error') {
        // Parent worktree failed - block child execution
        const error = current._execution.error || new Error('Worktree setup failed')
        throw new Error(`Cannot execute agent: parent worktree failed (${error.message})`)
      }
      if (current._execution?.status === 'complete') {
        const result = current._execution.result as { path: string } | undefined
        return result?.path || null
      }
    }
    current = current.parent
  }

  return null
}

/**
 * Find nodes that are ready for execution
 */
export function findPendingExecutables(tree: SmithersNode): SmithersNode[] {
  const executables: SmithersNode[] = []

  function walk(node: SmithersNode) {
    // Check for 'claude' (Agent SDK), 'claude-api' (API SDK), and 'claude-cli' (deprecated CLI) node types
    if (node.type === 'claude' || node.type === 'claude-api' || node.type === 'claude-cli') {
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
function computeContentHash(node: SmithersNode): string {
  // Hash based on: node type, props (excluding functions), and children structure
  const parts: string[] = [node.type]

  // Add props (excluding functions and React internals)
  for (const [key, value] of Object.entries(node.props)) {
    if (typeof value !== 'function' && key !== 'children' && !key.startsWith('_')) {
      parts.push(`${key}:${safeStringify(value)}`)
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
 * Safely stringify a value for hashing, handling edge cases
 * Uses a cycle-safe stringifier to avoid hash collisions
 */
function safeStringify(value: unknown): string {
  try {
    // Handle primitives directly
    if (value === null || value === undefined) {
      return String(value)
    }

    // Handle BigInt
    if (typeof value === 'bigint') {
      return `bigint:${value.toString()}`
    }

    // Handle symbols
    if (typeof value === 'symbol') {
      return `symbol:${value.toString()}`
    }

    // Try JSON.stringify for objects/arrays with cycle detection
    if (typeof value === 'object') {
      const seen = new WeakSet()
      return JSON.stringify(value, (key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) {
            return '[Circular]'
          }
          seen.add(val)
        }
        // Handle BigInt in nested objects
        if (typeof val === 'bigint') {
          return `bigint:${val.toString()}`
        }
        return val
      })
    }

    return String(value)
  } catch (error) {
    // Fallback for other stringify errors
    return `[unstringifiable:${typeof value}]`
  }
}

/**
 * Prepare tools for a node by connecting to MCP servers and merging with inline tools
 *
 * @param node The node to prepare tools for
 * @param mcpManager The MCP manager instance
 * @returns Combined array of tools from MCP servers and inline tools
 */
async function prepareTools(node: SmithersNode, mcpManager: MCPManager): Promise<Tool[]> {
  const tools: Tool[] = []

  // Connect to MCP servers if specified
  const mcpServerConfigs = node.props.mcpServers as MCPServerConfig[] | undefined
  if (mcpServerConfigs && mcpServerConfigs.length > 0) {
    // Connect to all MCP servers
    await Promise.all(
      mcpServerConfigs.map(async (config) => {
        try {
          await mcpManager.connect(config)
        } catch (error) {
          console.warn(`Failed to connect to MCP server "${config.name}":`, error)
        }
      })
    )

    // Get tools ONLY from the MCP servers specified for this node
    // This prevents tool leakage from earlier nodes
    for (const config of mcpServerConfigs) {
      const mcpTools = mcpManager.getToolsForServer(config.name)
      for (const mcpTool of mcpTools) {
        tools.push({
          name: mcpTool.name,
          description: mcpTool.description || '',
          input_schema: mcpTool.inputSchema,
          execute: async (args: unknown) => {
            // Call the MCP tool through the manager
            const result = await mcpManager.callTool(
              mcpTool.name,
              args as Record<string, unknown>
            )

            if (!result.success) {
              throw new Error(result.error || 'Tool execution failed')
            }

            // Return the first text content, or empty string if no content
            const textContent = result.content?.find((c) => c.type === 'text')
            return textContent?.text || ''
          },
        })
      }
    }
  }

  // Add inline tools from the tools prop
  const inlineTools = node.props.tools as Tool[] | undefined
  if (inlineTools) {
    // Check for tool name collisions between MCP and inline tools
    const toolNames = new Set(tools.map((t) => t.name))
    for (const inlineTool of inlineTools) {
      if (toolNames.has(inlineTool.name)) {
        console.warn(
          `Tool name collision detected: "${inlineTool.name}" is provided by both MCP server and inline tools. ` +
            `The inline tool will take precedence.`
        )
        // Remove ALL MCP tools with the same name (handles multiple MCP servers exposing the same tool)
        // Find all indices in reverse order to safely remove them
        for (let i = tools.length - 1; i >= 0; i--) {
          if (tools[i].name === inlineTool.name) {
            tools.splice(i, 1)
          }
        }
      }
      tools.push(inlineTool)
    }
  }

  return tools
}

/**
 * Generate workflow tools from workflow-output children of a node
 *
 * For each workflow-output node found, creates a tool that sets the
 * corresponding value in the workflow store.
 *
 * @param node The node to search for workflow outputs
 * @returns Array of tools for setting workflow values
 */
function generateWorkflowTools(
  node: SmithersNode,
  onValueSet?: () => void
): Tool[] {
  const outputNodes = findWorkflowOutputs(node)
  const tools: Tool[] = []

  for (const output of outputNodes) {
    const name = output.props.name as string
    const description = (output.props.description as string) || `Set the value of ${name}`
    const schema = output.props.schema
    const workflowId = output.props._workflowId as string | undefined

    // Convert Zod schema to JSON Schema for the tool
    // Only call zodSchemaToToolSchema if schema is defined
    const inputSchema = schema ? zodSchemaToToolSchema(schema) : { type: 'object', properties: {} }

    tools.push({
      name: `set_${name}`,
      description,
      input_schema: inputSchema as Tool['input_schema'],
      execute: async (input: unknown) => {
        // Find the workflow store from the tree, matching the workflow ID
        const store = getWorkflowStoreFromTree(node, workflowId)
        if (store) {
          // Extract value from input (tools always receive { value: ... })
          const value =
            typeof input === 'object' && input !== null && 'value' in input
              ? (input as { value: unknown }).value
              : input
          store.setValue(name, value)
          // Notify that workflow values were set
          if (onValueSet) {
            onValueSet()
          }
          return `Successfully set ${name}`
        }
        return `Warning: No workflow store found for ${name}`
      },
    })
  }

  return tools
}

/**
 * Default token estimation function
 * Uses simple heuristics: ~4 chars per token for input, fixed estimate for output
 */
function defaultEstimateTokens(prompt: string): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: 1000, // Conservative estimate
  }
}

/**
 * Result of executing a node
 */
export interface ExecuteNodeResult {
  /** Whether workflow values were set during execution */
  workflowValuesSet: boolean
}

/**
 * Execute a single node
 *
 * Calls the Claude API via the Anthropic SDK, or uses mock mode for testing.
 *
 * @param node The node to execute
 * @param mcpManager The MCP manager instance
 * @param onFinishedOverride Optional callback to use instead of node.props.onFinished
 * @param onErrorOverride Optional callback to use instead of node.props.onError
 * @returns ExecuteNodeResult indicating what happened during execution
 */
export async function executeNode(
  node: SmithersNode,
  mcpManager: MCPManager,
  onFinishedOverride?: (output: unknown) => void,
  onErrorOverride?: (error: Error) => void,
  executionOptions?: ExecuteOptions
): Promise<ExecuteNodeResult> {
  // Compute content hash for change detection
  const contentHash = computeContentHash(node)

  node._execution = {
    status: 'running',
    contentHash,
  }

  // Check for onError callback
  const onError =
    onErrorOverride || (node.props.onError as ((error: Error) => void) | undefined)

  // Get provider context for rate limiting and usage tracking
  const providerContext = executionOptions?.providerContext

  // Track whether workflow values were set during execution
  let workflowValuesSet = false

  try {
    let output: string
    // Track usage for reporting (populated by executors that support it)
    let usageInfo: {
      inputTokens?: number
      outputTokens?: number
      cacheReadTokens?: number
      cacheCreationTokens?: number
      costUsd?: number
    } | undefined

    // Check if we should use mock mode (for testing only)
    // mockMode option overrides environment variable in both directions:
    // - mockMode: true forces mock mode
    // - mockMode: false forces real mode (ignores SMITHERS_MOCK_MODE env var)
    // - mockMode: undefined uses environment variable + node props
    const apiKeyAvailable = Boolean(process.env.ANTHROPIC_API_KEY || providerContext?.apiKey)
    const mockOverride = executionOptions?.mockMode

    let useMockMode: boolean
    if (mockOverride !== undefined) {
      // Explicit override from options
      useMockMode = mockOverride
    } else {
      // Check environment variable and node props
      useMockMode =
        process.env.SMITHERS_MOCK_MODE === 'true' ||
        node.props._mockMode === true
    }

    // Require API key if not in mock mode
    if (!apiKeyAvailable && !useMockMode) {
      throw new Error(
        'ANTHROPIC_API_KEY not found. Set it in your environment or enable mock mode with SMITHERS_MOCK_MODE=true.'
      )
    }

    // Provider context integration: Check budget and acquire rate limit
    if (providerContext && !useMockMode) {
      // Check budget before execution
      const budgetCheck = providerContext.checkBudget()
      if (!budgetCheck.allowed) {
        // Pause and wait for budget to become available
        await providerContext.waitForBudget()
      }

      // Estimate tokens for rate limiting
      const promptText = extractTextContent(node)
      const estimator = providerContext.estimateTokens ?? defaultEstimateTokens
      const tokenEstimate = estimator(promptText)

      // Acquire rate limit permission (may queue if limited)
      await providerContext.acquireRateLimit(tokenEstimate)
    }

    // Route to appropriate executor based on node type
    if (node.type === 'claude-cli') {
      // Deprecated CLI executor
      if (useMockMode) {
        output = await executeMock(node)
      } else {
        output = await executeWithClaudeCli(node)
      }
    } else if (node.type === 'claude-api') {
      // API SDK executor (direct Anthropic API calls)
      const preparedTools = await prepareTools(node, mcpManager)

      // Add workflow output tools if the node has workflow-output children
      // Pass a callback to set the workflowValuesSet flag when values are set
      const workflowTools = generateWorkflowTools(node, () => {
        workflowValuesSet = true
      })
      const allTools = [...preparedTools, ...workflowTools]

      if (useMockMode) {
        output = await executeMock(node)
        // In mock mode, simulate setting workflow values
        // Use findWorkflowOutputs to get the original output nodes with workflow IDs
        const outputNodes = findWorkflowOutputs(node)
        if (outputNodes.length > 0) {
          for (const outputNode of outputNodes) {
            const fieldName = outputNode.props.name as string
            const outputWorkflowId = outputNode.props._workflowId as string | undefined
            const store = getWorkflowStoreFromTree(node, outputWorkflowId)
            if (store) {
              // Set a mock value
              store.setValue(fieldName, `[mock value for ${fieldName}]`)
              workflowValuesSet = true
            }
          }
        }
      } else {
        output = await executeWithClaude(
          node,
          {
            model: executionOptions?.model,
            maxTokens: executionOptions?.maxTokens,
          },
          allTools
        )
        // Note: executeWithClaude doesn't currently return usage info
        // This could be enhanced in a future update
      }
    } else {
      // Default: Agent SDK executor (node.type === 'claude')
      // Uses Claude Agent SDK with built-in tools
      if (useMockMode) {
        const mockResult = await executeAgentMock(node)
        output = mockResult.result || ''
        // In mock mode, simulate setting workflow values for Agent SDK too
        // Use findWorkflowOutputs to get the original output nodes with workflow IDs
        const outputNodes = findWorkflowOutputs(node)
        if (outputNodes.length > 0) {
          for (const outputNode of outputNodes) {
            const fieldName = outputNode.props.name as string
            const outputWorkflowId = outputNode.props._workflowId as string | undefined
            const store = getWorkflowStoreFromTree(node, outputWorkflowId)
            if (store) {
              // Set a mock value
              store.setValue(fieldName, `[mock value for ${fieldName}]`)
              workflowValuesSet = true
            }
          }
        }
      } else {
        const nodePath = getNodePath(node)
        const agentResult = await executeWithAgentSdk(node, nodePath)
        if (!agentResult.success) {
          const errorMessage = agentResult.error || 'Agent execution failed without error message'
          throw new Error(errorMessage)
        }
        // Prefer structured output if available, otherwise use result string
        output = agentResult.structuredOutput !== undefined
          ? JSON.stringify(agentResult.structuredOutput)
          : (agentResult.result || '')

        // Capture usage info from Agent SDK result
        if (agentResult.totalCostUsd !== undefined) {
          usageInfo = {
            costUsd: agentResult.totalCostUsd,
            // Note: Agent SDK doesn't expose token counts directly
            // We use a rough estimate based on cost and model pricing
            inputTokens: undefined,
            outputTokens: undefined,
          }
        }
      }
    }

    // Report usage to provider context (if available and not mock mode)
    if (providerContext && usageInfo && !useMockMode) {
      const model = (node.props.model as string) ?? executionOptions?.model
      providerContext.reportUsage({
        inputTokens: usageInfo.inputTokens ?? 0,
        outputTokens: usageInfo.outputTokens ?? 0,
        cacheReadTokens: usageInfo.cacheReadTokens,
        cacheCreationTokens: usageInfo.cacheCreationTokens,
        costUsd: usageInfo.costUsd,
        model,
      })
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

    return { workflowValuesSet }
  } catch (error) {
    // Enhance error with context if it's not already an ExecutionError
    let enhancedError: Error | ExecutionError = error as Error

    if (!(error as ExecutionError).nodeType) {
      enhancedError = createExecutionError(
        (error as Error).message || String(error),
        {
          nodeType: node.type,
          nodePath: getNodePath(node),
          input: extractTextContent(node),
          cause: error as Error,
        }
      )
    }

    node._execution = {
      status: 'error',
      error: enhancedError,
      contentHash,
    }

    if (onError) {
      onError(enhancedError)
      return { workflowValuesSet }
    } else {
      throw enhancedError
    }
  }
}

/**
 * Execute a node in mock mode (for testing)
 *
 * Returns a mock response based on the prompt content
 */
async function executeMock(node: SmithersNode): Promise<string> {
  const promptText = extractTextContent(node)

  // Simulate intentional failures for testing
  if (
    promptText.toLowerCase().includes('fail intentionally') ||
    promptText.toLowerCase().includes('will fail')
  ) {
    throw createExecutionError('Simulated failure for testing', {
      nodeType: node.type,
      nodePath: getNodePath(node),
      input: promptText,
    })
  }

  let mockOutput: string = 'Hello, I am Smithers! A React-based framework for AI agent prompts.'

  // Check if we should return JSON
  // Look for JSON keywords, JSON objects (curly braces), or schema prop
  const hasJsonIndicator =
    promptText.includes('JSON') ||
    promptText.includes('json') ||
    promptText.includes('JSON.stringify') ||
    promptText.match(/\{[^}]*\}/) !== null || // Contains a JSON object
    node.props.schema ||
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
function hasChildOfType(node: SmithersNode, type: string): boolean {
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
function extractTextContent(node: SmithersNode): string {
  let text = ''

  if (node.type === 'TEXT') {
    return String(node.props.children ?? node.props.value ?? '')
  }

  // Recursively extract from children nodes
  for (const child of node.children) {
    text += extractTextContent(child)
  }

  return text
}
