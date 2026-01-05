import type { ReactElement } from 'react'
import type { ExecuteOptions, ExecutionResult, FrameResult, PluNode } from './types.js'
import { createRoot, renderPlan } from './render.js'

/**
 * Execute a plan using the Ralph Wiggum loop
 *
 * STUB: Will be implemented with Claude SDK integration
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

  console.log('[STUB] executePlan() called')

  const history: FrameResult[] = []
  const startTime = Date.now()

  // STUB: Simulate one frame of execution
  const plan = await renderPlan(element)

  if (onPlan) {
    onPlan(plan, 1)
  }

  const frameResult: FrameResult = {
    frame: 1,
    plan,
    executedNodes: ['claude'],
    stateChanges: false,
    duration: 100,
  }

  history.push(frameResult)

  if (onFrame) {
    onFrame(frameResult)
  }

  if (verbose) {
    console.log(`[Frame 1] Executed nodes: ${frameResult.executedNodes.join(', ')}`)
  }

  return {
    output: { message: 'STUB: Execution complete' },
    frames: 1,
    totalDuration: Date.now() - startTime,
    history,
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
 * STUB: Will call Claude SDK
 */
export async function executeNode(node: PluNode): Promise<void> {
  console.log(`[STUB] executeNode() called for ${node.type}`)

  node._execution = {
    status: 'running',
  }

  // STUB: Simulate execution delay
  await new Promise((resolve) => setTimeout(resolve, 100))

  node._execution = {
    status: 'complete',
    result: { message: 'STUB: Node execution complete' },
  }

  // Call onFinished if present
  const onFinished = node.props.onFinished as ((output: unknown) => void) | undefined
  if (onFinished) {
    onFinished(node._execution.result)
  }
}
