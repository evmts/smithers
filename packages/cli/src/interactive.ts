/**
 * Interactive CLI commands for controlling execution
 *
 * Provides slash commands like /pause, /resume, /status for real-time control
 * of the Ralph Wiggum loop during execution.
 */

import type { SmithersNode, ExecutionController as IExecutionController } from '@evmts/smithers'
import { getNodePath } from '@evmts/smithers'

/**
 * Parsed command from user input
 */
export interface CommandInput {
  command: string // e.g., "pause", "skip"
  args: string[] // Parsed arguments
  rawInput: string // Full input text
}

/**
 * Execution status snapshot
 */
export interface ExecutionStatus {
  frame: number
  elapsed: number
  state: 'running' | 'paused' | 'aborted'
  pendingNodes: Array<{ path: string; type: string; name?: string }>
  runningNodes: Array<{ path: string; type: string; name?: string }>
  completedNodes: number
  failedNodes: number
}

/**
 * Controller for execution state and commands
 *
 * Used by executePlan() to check state before each frame
 * and by command handlers to update state.
 */
export class ExecutionController implements IExecutionController {
  paused: boolean = false
  skipNextNode: boolean = false
  skipNodePath?: string
  injectedPrompt?: string
  aborted: boolean = false
  abortReason?: string

  // Internal state for status
  private _frame: number = 0
  private _startTime: number = Date.now()
  private _tree?: SmithersNode

  /**
   * Pause execution after current frame
   */
  pause(): void {
    this.paused = true
  }

  /**
   * Resume execution from paused state
   */
  resume(): void {
    if (!this.paused) {
      throw new Error('Cannot resume: not paused')
    }
    this.paused = false
  }

  /**
   * Skip the next pending node (or specific node by path)
   */
  skip(nodePath?: string): void {
    this.skipNextNode = true
    this.skipNodePath = nodePath
  }

  /**
   * Inject additional context into next Claude node
   */
  inject(prompt: string): void {
    this.injectedPrompt = prompt
  }

  /**
   * Abort execution immediately
   */
  abort(reason?: string): void {
    this.aborted = true
    this.abortReason = reason
  }

  /**
   * Get current execution status
   */
  getStatus(): ExecutionStatus {
    const elapsed = Date.now() - this._startTime
    const state = this.aborted ? 'aborted' : this.paused ? 'paused' : 'running'

    const pendingNodes: Array<{ path: string; type: string; name?: string }> = []
    const runningNodes: Array<{ path: string; type: string; name?: string }> = []
    let completedNodes = 0
    let failedNodes = 0

    if (this._tree) {
      this._walkTree(this._tree, (node) => {
        // Only count executable node types (claude, claude-api, claude-cli)
        const isExecutable = node.type === 'claude' || node.type === 'claude-api' || node.type === 'claude-cli'
        if (!isExecutable) return

        const status = node._execution?.status
        // Treat missing execution as pending (most pending nodes don't have _execution set yet)
        if (!status || status === 'pending') {
          pendingNodes.push({
            path: getNodePath(node),
            type: node.type,
            name: node.props.name as string | undefined,
          })
        } else if (status === 'running') {
          runningNodes.push({
            path: getNodePath(node),
            type: node.type,
            name: node.props.name as string | undefined,
          })
        } else if (status === 'complete') {
          completedNodes++
        } else if (status === 'error') {
          failedNodes++
        }
      })
    }

    return {
      frame: this._frame,
      elapsed,
      state,
      pendingNodes,
      runningNodes,
      completedNodes,
      failedNodes,
    }
  }

  /**
   * Update internal state (called by executePlan)
   */
  _updateState(frame: number, tree: SmithersNode): void {
    this._frame = frame
    this._tree = tree
  }

  /**
   * Reset controller for new execution
   */
  reset(): void {
    this.paused = false
    this.skipNextNode = false
    this.skipNodePath = undefined
    this.injectedPrompt = undefined
    this.aborted = false
    this.abortReason = undefined
    this._frame = 0
    this._startTime = Date.now()
    this._tree = undefined
  }

  /**
   * Walk tree and invoke callback for each node
   */
  private _walkTree(node: SmithersNode, callback: (node: SmithersNode) => void): void {
    callback(node)
    for (const child of node.children) {
      this._walkTree(child, callback)
    }
  }
}

/**
 * Parse slash command from user input
 *
 * @example
 * parseCommand('/pause') // { command: 'pause', args: [], rawInput: '/pause' }
 * parseCommand('/focus ROOT/claude[0]') // { command: 'focus', args: ['ROOT/claude[0]'], rawInput: '...' }
 */
export function parseCommand(input: string): CommandInput {
  const trimmed = input.trim()

  // Must start with /
  if (!trimmed.startsWith('/')) {
    throw new Error('Commands must start with /')
  }

  // Remove leading /
  const withoutSlash = trimmed.slice(1)

  // Split by whitespace
  const parts = withoutSlash.split(/\s+/)
  const command = parts[0]
  const args = parts.slice(1)

  return {
    command,
    args,
    rawInput: input,
  }
}

/**
 * Format tree as compact string representation
 *
 * @example
 * ROOT
 * ├─ phase[0] name="planning"
 * │  └─ claude[0] status=complete
 * └─ phase[1] name="implementation"
 *    └─ claude[1] status=pending
 */
export function formatTree(tree: SmithersNode, options: { full?: boolean } = {}): string {
  const lines: string[] = []

  function walk(node: SmithersNode, prefix: string, isLast: boolean): void {
    // Node label
    const status = node._execution?.status
    const statusIcon = status === 'complete' ? '✓' : status === 'error' ? '✗' : status === 'running' ? '▶' : '⏳'

    let label = node.type
    if (node.props.name) {
      label += ` name="${node.props.name}"`
    }
    if (!options.full && status) {
      label += ` ${statusIcon}`
    }

    // Add line
    const connector = isLast ? '└─' : '├─'
    lines.push(`${prefix}${connector} ${label}`)

    // Full mode: show props and execution state
    if (options.full) {
      const childPrefix = prefix + (isLast ? '   ' : '│  ')

      // Show props
      const propsStr = JSON.stringify(node.props, null, 2)
      lines.push(`${childPrefix}props: ${propsStr}`)

      // Show execution state
      if (node._execution) {
        const execStr = JSON.stringify(
          {
            status: node._execution.status,
            result: typeof node._execution.result === 'string' ? node._execution.result.slice(0, 50) + '...' : node._execution.result,
            error: node._execution.error?.message,
          },
          null,
          2
        )
        lines.push(`${childPrefix}execution: ${execStr}`)
      }
    }

    // Recurse to children
    const children = node.children
    children.forEach((child, i) => {
      const childPrefix = prefix + (isLast ? '   ' : '│  ')
      walk(child, childPrefix, i === children.length - 1)
    })
  }

  walk(tree, '', true)
  return lines.join('\n')
}

/**
 * Find node by path in tree
 *
 * @example
 * findNodeByPath(tree, 'ROOT/phase[0]/claude[1]')
 */
export function findNodeByPath(tree: SmithersNode, targetPath: string): SmithersNode | null {
  function walk(node: SmithersNode): SmithersNode | null {
    const path = getNodePath(node)
    if (path === targetPath) {
      return node
    }
    for (const child of node.children) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(tree)
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

/**
 * Command result for displaying to user
 */
export interface CommandResult {
  success: boolean
  message: string
  data?: unknown
}

/**
 * Handle a parsed command and update controller state
 */
export function handleCommand(cmd: CommandInput, controller: ExecutionController, tree?: SmithersNode): CommandResult {
  try {
    switch (cmd.command) {
      case 'pause':
        return handlePause(controller)

      case 'resume':
        return handleResume(controller)

      case 'status':
        return handleStatus(controller)

      case 'tree':
        return handleTree(tree, cmd.args)

      case 'focus':
        return handleFocus(tree, cmd.args)

      case 'skip':
        return handleSkip(controller, cmd.args)

      case 'inject':
        return handleInject(controller, cmd.args)

      case 'abort':
        return handleAbort(controller, cmd.args)

      case 'help':
        return handleHelp(cmd.args)

      default:
        return {
          success: false,
          message: `❌ Unknown command: /${cmd.command}\nType /help for available commands.`,
        }
    }
  } catch (error) {
    return {
      success: false,
      message: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function handlePause(controller: ExecutionController): CommandResult {
  if (controller.paused) {
    return {
      success: false,
      message: '❌ Already paused',
    }
  }
  controller.pause()
  return {
    success: true,
    message: `✓ Paused at frame ${controller.getStatus().frame}`,
  }
}

function handleResume(controller: ExecutionController): CommandResult {
  controller.resume() // throws if not paused
  return {
    success: true,
    message: '✓ Resumed execution',
  }
}

function handleStatus(controller: ExecutionController): CommandResult {
  const status = controller.getStatus()
  const elapsed = formatDuration(status.elapsed)

  const lines = [
    'Execution Status:',
    `  Frame: ${status.frame}`,
    `  Elapsed: ${elapsed}`,
    `  Pending Nodes: ${status.pendingNodes.length}`,
  ]

  if (status.pendingNodes.length > 0) {
    for (const node of status.pendingNodes) {
      const nameStr = node.name ? ` (name: "${node.name}")` : ''
      lines.push(`    - ${node.type}${nameStr}`)
    }
  }

  lines.push(`  Running Nodes: ${status.runningNodes.length}`)

  if (status.runningNodes.length > 0) {
    for (const node of status.runningNodes) {
      const nameStr = node.name ? ` (name: "${node.name}")` : ''
      lines.push(`    - ${node.type}${nameStr}`)
    }
  }

  lines.push(`  Completed Nodes: ${status.completedNodes}`)
  lines.push(`  Failed Nodes: ${status.failedNodes}`)
  lines.push(`  State: ${status.state}`)

  return {
    success: true,
    message: lines.join('\n'),
    data: status,
  }
}

function handleTree(tree: SmithersNode | undefined, args: string[]): CommandResult {
  if (!tree) {
    return {
      success: false,
      message: '❌ No tree available',
    }
  }

  const full = args.includes('--full')
  const formatted = formatTree(tree, { full })

  return {
    success: true,
    message: formatted,
  }
}

function handleFocus(tree: SmithersNode | undefined, args: string[]): CommandResult {
  if (!tree) {
    return {
      success: false,
      message: '❌ No tree available',
    }
  }

  if (args.length === 0) {
    return {
      success: false,
      message: '❌ /focus requires a node path\nUsage: /focus <path>',
    }
  }

  const targetPath = args[0]
  const node = findNodeByPath(tree, targetPath)

  if (!node) {
    return {
      success: false,
      message: `❌ Node not found: ${targetPath}\nUse /tree to see available paths.`,
    }
  }

  // In TUI mode, this would trigger navigation
  // For now, just show node info
  return {
    success: true,
    message: `✓ Found node: ${node.type} at ${targetPath}`,
    data: { node, path: targetPath },
  }
}

function handleSkip(controller: ExecutionController, args: string[]): CommandResult {
  const nodePath = args[0] // optional

  controller.skip(nodePath)

  if (nodePath) {
    return {
      success: true,
      message: `✓ Will skip node: ${nodePath}`,
    }
  } else {
    return {
      success: true,
      message: '✓ Will skip next pending node',
    }
  }
}

function handleInject(controller: ExecutionController, args: string[]): CommandResult {
  if (args.length === 0) {
    return {
      success: false,
      message: '❌ /inject requires prompt text\nUsage: /inject <prompt>',
    }
  }

  const prompt = args.join(' ')
  controller.inject(prompt)

  return {
    success: true,
    message: `✓ Context will be injected into next Claude node:\n  "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
  }
}

function handleAbort(controller: ExecutionController, args: string[]): CommandResult {
  const reason = args.join(' ') || undefined
  controller.abort(reason)

  const reasonStr = reason ? `: ${reason}` : ''
  return {
    success: true,
    message: `✓ Aborting execution${reasonStr}`,
  }
}

function handleHelp(args: string[]): CommandResult {
  if (args.length === 0) {
    // General help
    return {
      success: true,
      message: `Available Commands:
  /pause          Pause execution
  /resume         Resume execution
  /status         Show execution status
  /tree           Show node tree
  /focus <path>   Focus on node
  /skip [<path>]  Skip pending node
  /inject <text>  Inject context
  /abort [reason] Abort execution
  /help [cmd]     Show this help

Type /help <command> for detailed usage.`,
    }
  }

  // Detailed help for specific command
  const command = args[0]
  const helpText: Record<string, string> = {
    pause: `/pause
Pauses the Ralph Wiggum loop after the current frame completes.
Execution can be resumed with /resume.`,

    resume: `/resume
Resumes execution from a paused state.
Continues Ralph loop from next pending frame.`,

    status: `/status
Shows current execution state without modifying behavior.
Displays frame count, elapsed time, pending/completed nodes.`,

    tree: `/tree [--full]
Prints the current SmithersNode tree in a compact format.
Options:
  --full    Include all props and execution state details`,

    focus: `/focus <path>
In TUI mode, focuses on a specific node by path.
Path format: ROOT/type[index]/type[index]
Example: /focus ROOT/phase[1]/claude[0]`,

    skip: `/skip [<path>]
Marks a node as skipped, continues to next.
Arguments:
  <path>    (optional) Path to specific node
  (no args) Skips the first pending node`,

    inject: `/inject <prompt>
Injects additional context into the next Claude node execution.
Example: /inject Use TypeScript strict mode`,

    abort: `/abort [<reason>]
Immediately stops execution and exits gracefully.
Arguments:
  <reason>  (optional) Reason for aborting (logged)`,
  }

  const text = helpText[command]
  if (!text) {
    return {
      success: false,
      message: `❌ No help available for: /${command}\nType /help for available commands.`,
    }
  }

  return {
    success: true,
    message: text,
  }
}
