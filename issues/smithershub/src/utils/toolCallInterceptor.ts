/**
 * Tool call interceptor for automatic snapshot creation
 * Wraps tool calls with JJ snapshot creation for version control tracking
 */

export interface ToolCallHandler {
  toolName: string
  handler: (args: any) => Promise<any>
}

export interface ToolCallConfig {
  enabled?: boolean
  snapshotOnError?: boolean
  excludeTools?: string[]
  maxHistorySize?: number
}

export interface InterceptedToolCall {
  toolName: string
  args: any
  timestamp: Date
  success: boolean
  result?: any
  error?: string
  snapshotCreated: boolean
  snapshotId?: string
}

export type SnapshotFunction = (toolName: string) => Promise<void>

/**
 * Tool call interceptor that creates snapshots before tool execution
 */
export class ToolCallInterceptor {
  private tools = new Map<string, (args: any) => Promise<any>>()
  private callHistory: InterceptedToolCall[] = []
  private config: Required<ToolCallConfig>

  constructor(
    private createSnapshot: SnapshotFunction,
    config: ToolCallConfig = {}
  ) {
    this.config = {
      enabled: true,
      snapshotOnError: false,
      excludeTools: [],
      maxHistorySize: 100,
      ...config
    }
  }

  /**
   * Update interceptor configuration
   */
  configure(config: Partial<ToolCallConfig>): void {
    Object.assign(this.config, config)
  }

  /**
   * Check if interception is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Register a single tool handler
   */
  registerTool(handler: ToolCallHandler): void {
    this.tools.set(handler.toolName, handler.handler)
  }

  /**
   * Register multiple tool handlers
   */
  registerTools(handlers: ToolCallHandler[]): void {
    handlers.forEach(handler => this.registerTool(handler))
  }

  /**
   * Get list of registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * Clear all tool registrations
   */
  clearRegistrations(): void {
    this.tools.clear()
  }

  /**
   * Execute a tool with optional snapshot creation
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    const toolHandler = this.tools.get(toolName)
    if (!toolHandler) {
      throw new Error(`Tool "${toolName}" not registered`)
    }

    const callRecord: InterceptedToolCall = {
      toolName,
      args,
      timestamp: new Date(),
      success: false,
      snapshotCreated: false
    }

    let shouldCreateSnapshot = false
    let toolResult: any
    let toolError: Error | undefined

    try {
      // Determine if we should create a snapshot before execution
      shouldCreateSnapshot = this.shouldCreateSnapshot(toolName)

      // Create snapshot before tool execution if enabled
      if (shouldCreateSnapshot) {
        try {
          await this.createSnapshot(toolName)
          callRecord.snapshotCreated = true
          // Note: We don't have access to snapshot ID from the function
          // In a real implementation, the snapshot function might return it
        } catch (snapshotError) {
          // Log snapshot error but continue with tool execution
          console.warn(`Failed to create snapshot for ${toolName}:`, snapshotError)
          callRecord.snapshotCreated = false
        }
      }

      // Execute the actual tool
      toolResult = await toolHandler(args)
      callRecord.success = true
      callRecord.result = toolResult

    } catch (error) {
      toolError = error instanceof Error ? error : new Error(String(error))
      callRecord.success = false
      callRecord.error = toolError.message

      // Create snapshot on error if configured
      if (this.config.snapshotOnError && !callRecord.snapshotCreated) {
        try {
          await this.createSnapshot(toolName)
          callRecord.snapshotCreated = true
        } catch (snapshotError) {
          console.warn(`Failed to create error snapshot for ${toolName}:`, snapshotError)
        }
      }
    }

    // Add to history (maintaining size limit)
    this.addToHistory(callRecord)

    // Re-throw tool error if it occurred
    if (toolError) {
      throw toolError
    }

    return toolResult
  }

  /**
   * Get call history
   */
  getCallHistory(): InterceptedToolCall[] {
    return [...this.callHistory] // Return copy to prevent mutation
  }

  /**
   * Clear call history
   */
  clearHistory(): void {
    this.callHistory = []
  }

  /**
   * Determine if snapshot should be created for a tool
   */
  private shouldCreateSnapshot(toolName: string): boolean {
    if (!this.config.enabled) {
      return false
    }

    if (this.config.excludeTools.includes(toolName)) {
      return false
    }

    return true
  }

  /**
   * Add call record to history with size management
   */
  private addToHistory(record: InterceptedToolCall): void {
    this.callHistory.unshift(record) // Add to beginning (most recent first)

    // Trim history if it exceeds max size
    if (this.callHistory.length > this.config.maxHistorySize) {
      this.callHistory = this.callHistory.slice(0, this.config.maxHistorySize)
    }
  }

  /**
   * Get statistics about tool usage
   */
  getStatistics(): {
    totalCalls: number
    successfulCalls: number
    failedCalls: number
    snapshotsCreated: number
    mostUsedTool?: string
  } {
    const totalCalls = this.callHistory.length
    const successfulCalls = this.callHistory.filter(call => call.success).length
    const failedCalls = totalCalls - successfulCalls
    const snapshotsCreated = this.callHistory.filter(call => call.snapshotCreated).length

    // Find most used tool
    const toolCounts = new Map<string, number>()
    this.callHistory.forEach(call => {
      toolCounts.set(call.toolName, (toolCounts.get(call.toolName) || 0) + 1)
    })

    const mostUsedTool = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0]

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      snapshotsCreated,
      mostUsedTool
    }
  }

  /**
   * Get recent failures for debugging
   */
  getRecentFailures(limit: number = 5): InterceptedToolCall[] {
    return this.callHistory
      .filter(call => !call.success)
      .slice(0, limit)
  }

  /**
   * Export configuration for persistence/debugging
   */
  exportConfig(): Required<ToolCallConfig> {
    return { ...this.config }
  }
}