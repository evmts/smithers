/**
 * Tool Snapshot Wrapper - Wraps tool calls with automatic snapshot management
 * Provides high-level orchestration of tool execution with snapshot integration
 */

import type { RepoStateTracker } from '../../vcs/repo-state.js'

export interface SnapshotOptions {
  description?: string
  includeUntracked?: boolean
  verifyCleanState?: boolean
  createBookmark?: string
  skipEmptyCommits?: boolean
  timeout?: number
  autoCleanup?: boolean
}

export interface ToolExecutionContext {
  executionId: string
  agentId: string
  taskId?: string
  toolName: string
  userId?: string
  sessionId?: string
  snapshotId?: string
}

export interface JJSnapshot {
  id: string
  changeId: string
  description: string
  timestamp: Date
  parentChangeId?: string
  files: {
    modified: string[]
    added: string[]
    deleted: string[]
  }
  hasConflicts: boolean
  isEmpty: boolean
  bookmarks?: string[]
}

export interface JJSnapshotSystem {
  createSnapshot(options?: SnapshotOptions): Promise<JJSnapshot>
  rollback(target: JJSnapshot | string, options?: any): Promise<void>
  listSnapshots(limit?: number): Promise<JJSnapshot[]>
  cleanup(options?: any): Promise<void>
}

export interface ToolCallResult<T = any> {
  success: boolean
  result?: T
  error?: string
  snapshotBefore?: JJSnapshot
  snapshotAfter?: JJSnapshot
  rolledBack?: boolean
  rollbackError?: string
}

export interface HealthStatus {
  isHealthy: boolean
  repoState: 'clean' | 'dirty' | 'unknown'
  lastExecution?: Date
  pendingSnapshots: number
  issues: string[]
}

export interface ExecutionMetrics {
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  snapshotsCreated: number
  rollbacks: number
  toolUsage: Record<string, number>
  lastExecutionTime?: Date
}

export interface Logger {
  debug(message: string, context?: any): void
  info(message: string, context?: any): void
  warn(message: string, context?: any): void
  error(message: string, context?: any): void
}

export interface ToolSnapshotWrapper {
  wrapTool<T>(
    toolName: string,
    input: any,
    execute: (input: any) => Promise<T>,
    context: ToolExecutionContext,
    options?: SnapshotOptions
  ): Promise<ToolCallResult<T>>

  isReadOnlyTool(toolName: string): boolean
  getExecutionMetrics(): ExecutionMetrics
  performCleanup(options?: any): Promise<void>
  getHealthStatus(): Promise<HealthStatus>
}

export class ToolSnapshotError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'ToolSnapshotError'
  }
}

export interface ToolSnapshotWrapperConfig {
  snapshotSystem: JJSnapshotSystem
  repoStateTracker: RepoStateTracker
  logger?: Logger
}

const READ_ONLY_TOOLS = [
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TaskOutput'
] as const

const WRITE_TOOLS = [
  'Edit', 'Write', 'Bash', 'NotebookEdit', 'Task'
] as const

export function createToolSnapshotWrapper(config: ToolSnapshotWrapperConfig): ToolSnapshotWrapper {
  const { snapshotSystem, repoStateTracker, logger } = config

  const metrics: ExecutionMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    snapshotsCreated: 0,
    rollbacks: 0,
    toolUsage: {}
  }

  function validateInput(toolName: string, context: ToolExecutionContext): void {
    if (!toolName || toolName.trim() === '') {
      throw new ToolSnapshotError('Tool name cannot be empty')
    }
    if (!context.executionId || context.executionId.trim() === '') {
      throw new ToolSnapshotError('Execution ID cannot be empty')
    }
    if (!context.agentId || context.agentId.trim() === '') {
      throw new ToolSnapshotError('Agent ID cannot be empty')
    }
  }

  function updateMetrics(toolName: string, success: boolean, snapshotCreated: boolean, rolledBack: boolean): void {
    metrics.totalExecutions++
    metrics.lastExecutionTime = new Date()

    if (success) {
      metrics.successfulExecutions++
    } else {
      metrics.failedExecutions++
    }

    if (snapshotCreated) {
      metrics.snapshotsCreated++
    }

    if (rolledBack) {
      metrics.rollbacks++
    }

    // Track tool usage
    metrics.toolUsage[toolName] = (metrics.toolUsage[toolName] || 0) + 1
  }

  return {
    async wrapTool<T>(
      toolName: string,
      input: any,
      execute: (input: any) => Promise<T>,
      context: ToolExecutionContext,
      options: SnapshotOptions = {}
    ): Promise<ToolCallResult<T>> {
      validateInput(toolName, context)

      logger?.debug('Starting tool execution with snapshot wrapper', {
        toolName,
        executionId: context.executionId,
        agentId: context.agentId,
        taskId: context.taskId
      })

      // Check if this is a read-only tool
      if (this.isReadOnlyTool(toolName)) {
        try {
          const result = await execute(input)
          updateMetrics(toolName, true, false, false)

          logger?.debug('Read-only tool executed successfully', {
            toolName,
            executionId: context.executionId
          })

          return { success: true, result }
        } catch (error) {
          updateMetrics(toolName, false, false, false)
          logger?.error('Read-only tool execution failed', {
            toolName,
            executionId: context.executionId,
            error: error instanceof Error ? error.message : String(error)
          })

          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }

      // Verify clean state if required
      if (options.verifyCleanState) {
        try {
          const currentState = await repoStateTracker.getCurrentState()
          if (!repoStateTracker.isCleanState(currentState)) {
            throw new ToolSnapshotError('Repository is not in clean state')
          }
        } catch (error) {
          logger?.error('Clean state verification failed', {
            toolName,
            executionId: context.executionId,
            error: error instanceof Error ? error.message : String(error)
          })

          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }

      let snapshotBefore: JJSnapshot | undefined
      let snapshotAfter: JJSnapshot | undefined
      let rolledBack = false
      let rollbackError: string | undefined

      try {
        // Create before snapshot
        try {
          snapshotBefore = await snapshotSystem.createSnapshot({
            description: options.description || `Before ${toolName} tool execution`,
            context,
            includeUntracked: options.includeUntracked || false,
            ...options
          })

          logger?.debug('Before snapshot created', {
            toolName,
            executionId: context.executionId,
            snapshotId: snapshotBefore.id,
            changeId: snapshotBefore.changeId
          })
        } catch (error) {
          logger?.error('Failed to create before snapshot', {
            toolName,
            executionId: context.executionId,
            error: error instanceof Error ? error.message : String(error)
          })

          updateMetrics(toolName, false, false, false)
          return {
            success: false,
            error: `Failed to create before snapshot: ${error instanceof Error ? error.message : String(error)}`
          }
        }

        try {
          // Execute the tool
          const result = await Promise.race([
            execute(input),
            ...(options.timeout ? [
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Tool execution timeout')), options.timeout)
              )
            ] : [])
          ])

          // Tool succeeded - create after snapshot
          try {
            snapshotAfter = await snapshotSystem.createSnapshot({
              description: options.description || `After ${toolName} tool execution`,
              context,
              includeUntracked: options.includeUntracked || false,
              ...options
            })

            logger?.debug('After snapshot created', {
              toolName,
              executionId: context.executionId,
              snapshotId: snapshotAfter.id,
              changeId: snapshotAfter.changeId
            })
          } catch (error) {
            logger?.warn('Failed to create after snapshot (tool succeeded)', {
              toolName,
              executionId: context.executionId,
              error: error instanceof Error ? error.message : String(error)
            })
            // Don't fail the tool call if after snapshot fails
          }

          updateMetrics(toolName, true, true, false)

          logger?.info('Tool execution wrapped with snapshots', {
            toolName,
            executionId: context.executionId,
            success: true,
            beforeSnapshot: snapshotBefore.changeId,
            afterSnapshot: snapshotAfter?.changeId
          })

          return {
            success: true,
            result,
            snapshotBefore,
            snapshotAfter
          }

        } catch (toolError) {
          // Tool failed - rollback to before snapshot
          if (snapshotBefore) {
            try {
              await snapshotSystem.rollback(snapshotBefore)
              rolledBack = true

              logger?.debug('Rolled back to before snapshot after tool failure', {
                toolName,
                executionId: context.executionId,
                snapshotId: snapshotBefore.id,
                changeId: snapshotBefore.changeId
              })
            } catch (rollbackErr) {
              rollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
              logger?.error('Rollback failed after tool failure', {
                toolName,
                executionId: context.executionId,
                rollbackError
              })
            }
          }

          updateMetrics(toolName, false, true, rolledBack)

          logger?.error('Tool execution failed', {
            toolName,
            executionId: context.executionId,
            error: toolError instanceof Error ? toolError.message : String(toolError),
            rolledBack,
            rollbackError
          })

          return {
            success: false,
            error: toolError instanceof Error ? toolError.message : String(toolError),
            snapshotBefore,
            rolledBack,
            rollbackError
          }
        }

      } catch (error) {
        updateMetrics(toolName, false, false, false)
        logger?.error('Tool wrapper execution failed', {
          toolName,
          executionId: context.executionId,
          error: error instanceof Error ? error.message : String(error)
        })

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    },

    isReadOnlyTool(toolName: string): boolean {
      return (READ_ONLY_TOOLS as readonly string[]).includes(toolName)
    },

    getExecutionMetrics(): ExecutionMetrics {
      return { ...metrics }
    },

    async performCleanup(cleanupOptions?: any): Promise<void> {
      try {
        await snapshotSystem.cleanup(cleanupOptions)
        logger?.info('Snapshot cleanup completed', { options: cleanupOptions })
      } catch (error) {
        logger?.error('Snapshot cleanup failed', {
          error: error instanceof Error ? error.message : String(error),
          options: cleanupOptions
        })
        throw error
      }
    },

    async getHealthStatus(): Promise<HealthStatus> {
      try {
        const repoState = await repoStateTracker.getCurrentState()
        const isHealthy = repoStateTracker.isCleanState(repoState)
        const issues: string[] = []

        if (!isHealthy) {
          if (repoState.hasUncommittedChanges) {
            issues.push('Repository has uncommitted changes')
          }
          if (repoState.conflictedFiles.length > 0) {
            issues.push('Repository has conflicted files')
          }
        }

        // Get recent snapshots to check for pending cleanup
        const recentSnapshots = await snapshotSystem.listSnapshots(100)
        const pendingSnapshots = recentSnapshots.length

        return {
          isHealthy,
          repoState: isHealthy ? 'clean' : 'dirty',
          lastExecution: metrics.lastExecutionTime,
          pendingSnapshots,
          issues
        }
      } catch (error) {
        logger?.error('Health status check failed', {
          error: error instanceof Error ? error.message : String(error)
        })

        return {
          isHealthy: false,
          repoState: 'unknown',
          pendingSnapshots: 0,
          issues: ['Failed to check repository state']
        }
      }
    }
  }
}