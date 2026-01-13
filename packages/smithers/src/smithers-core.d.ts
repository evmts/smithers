/**
 * Type declarations for @evmts/smithers-core
 *
 * Re-declares the core module types for use in the smithers package.
 * The actual types come from smithers-core/src, but this ensures TypeScript
 * can resolve them during compilation.
 */
declare module '@evmts/smithers-core' {
  export interface SmithersNode {
    type: string
    props: Record<string, unknown>
    children: SmithersNode[]
    parent: SmithersNode | null
    _execution?: ExecutionState
  }

  export interface ExecutionState {
    status: 'pending' | 'running' | 'complete' | 'error'
    result?: unknown
    error?: Error
    contentHash?: string
  }

  export interface ExecuteOptions {
    verbose?: boolean
    maxFrames?: number
    onFrame?: (frame: FrameResult) => void
    onHumanPrompt?: (message: string, content: string) => Promise<boolean>
    onPlanApproval?: (plan: PlanInfo) => Promise<boolean>
    debug?: DebugOptions
    mcpServers?: MCPServerConfig[]
    claudeConfig?: ClaudeConfig
  }

  export interface ExecutionResult {
    output: unknown
    frames: number
    totalDuration: number
    frameDurations: number[]
    executedNodes: string[]
    nodeResults: Map<string, unknown>
    finalTree: SmithersNode
    stopped?: boolean
    stopReason?: string
  }

  export interface FrameResult {
    frame: number
    duration: number
    executedNodes: string[]
    pendingCount: number
    tree: SmithersNode
  }

  export interface ExecuteNodeResult {
    success: boolean
    result?: unknown
    error?: Error
  }

  export interface PlanInfo {
    xml: string
    nodes: string[]
  }

  export interface DebugOptions {
    enabled?: boolean
    showTree?: boolean
    showTimeline?: boolean
  }

  export interface MCPServerConfig {
    name: string
    transport: 'stdio' | 'http'
    command?: string
    args?: string[]
    url?: string
  }

  export interface ClaudeConfig {
    model?: string
    maxTokens?: number
    temperature?: number
  }

  export function executePlan(
    App: () => unknown,
    options?: ExecuteOptions
  ): Promise<ExecutionResult>

  export function executeNode(
    node: SmithersNode,
    options?: ExecuteOptions
  ): Promise<ExecuteNodeResult>
}
