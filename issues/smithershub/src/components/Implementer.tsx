/**
 * Implementer Component - Parallel task execution engine with timeout management
 * Handles multiple implementation tasks concurrently with dependency resolution
 */

import React, { useRef } from 'react'
import { useMount, useUnmount, useMountedState } from '../reconciler/hooks'
import { useImplementationResult, ImplementationTask } from '../hooks/useImplementationResult'
import { WorkspaceManager } from '../utils/workspaceManager'

export interface ImplementerTask extends ImplementationTask {
  dependencies?: string[]
  priority?: number
  workspace?: string
}

export interface ImplementerProps {
  tasks: ImplementerTask[]
  maxParallel?: number
  timeout?: number
  runTestsAfterTask?: boolean
  testRunner?: {
    runTests: (workspace: string) => Promise<{ passed: boolean; results: any[] }>
  }
  onProgress?: (taskId: string, progress: { status: string; message?: string }) => void
  onComplete?: (taskId: string, result: string) => void
  onError?: (taskId: string, error: string) => void
  onTimeout?: (taskId: string) => void
  onAllComplete?: (results: Array<{ taskId: string; success: boolean; result?: string; error?: string }>) => void
}

/**
 * Task queue management for parallel execution with dependency resolution
 */
class TaskQueue {
  private tasks: Map<string, ImplementerTask> = new Map()
  private completed: Set<string> = new Set()
  private failed: Set<string> = new Set()
  private running: Set<string> = new Set()

  constructor(tasks: ImplementerTask[]) {
    tasks.forEach(task => this.tasks.set(task.id, task))
  }

  getReadyTasks(maxCount: number): ImplementerTask[] {
    const readyTasks: ImplementerTask[] = []

    for (const [id, task] of this.tasks) {
      if (this.canExecute(task) && !this.running.has(id) && readyTasks.length < maxCount) {
        readyTasks.push(task)
      }
    }

    // Sort by priority (higher first)
    return readyTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0))
  }

  canExecute(task: ImplementerTask): boolean {
    if (this.completed.has(task.id) || this.failed.has(task.id) || this.running.has(task.id)) {
      return false
    }

    // Check dependencies
    if (task.dependencies) {
      return task.dependencies.every(dep => this.completed.has(dep))
    }

    return true
  }

  markRunning(taskId: string): void {
    this.running.add(taskId)
  }

  markCompleted(taskId: string): void {
    this.running.delete(taskId)
    this.completed.add(taskId)
  }

  markFailed(taskId: string): void {
    this.running.delete(taskId)
    this.failed.add(taskId)
  }

  isComplete(): boolean {
    return this.tasks.size === this.completed.size + this.failed.size
  }

  getStatus(): {
    total: number
    completed: number
    failed: number
    running: number
    pending: number
  } {
    return {
      total: this.tasks.size,
      completed: this.completed.size,
      failed: this.failed.size,
      running: this.running.size,
      pending: this.tasks.size - this.completed.size - this.failed.size - this.running.size
    }
  }
}

/**
 * Implementer component for parallel task execution
 */
export function Implementer({
  tasks,
  maxParallel = 3,
  timeout = 60000,
  runTestsAfterTask = false,
  testRunner,
  onProgress,
  onComplete,
  onError,
  onTimeout,
  onAllComplete
}: ImplementerProps) {
  const isMounted = useMountedState()
  const workspaceManagerRef = useRef<WorkspaceManager | null>(null)
  const taskQueueRef = useRef<TaskQueue | null>(null)
  const executionStateRef = useRef<{
    isRunning: boolean
    results: Array<{ taskId: string; success: boolean; result?: string; error?: string }>
  }>({
    isRunning: false,
    results: []
  })

  // Initialize workspace manager
  useMount(() => {
    workspaceManagerRef.current = new WorkspaceManager({
      baseDir: '.workspaces/implementer',
      timeout: timeout
    })

    taskQueueRef.current = new TaskQueue(tasks)
    startExecution()
  })

  // Cleanup on unmount
  useUnmount(() => {
    if (workspaceManagerRef.current) {
      workspaceManagerRef.current.cleanupAllWorkspaces()
    }
  })

  const startExecution = async () => {
    if (!isMounted() || !taskQueueRef.current || !workspaceManagerRef.current) {
      return
    }

    executionStateRef.current.isRunning = true

    while (!taskQueueRef.current.isComplete() && isMounted()) {
      const readyTasks = taskQueueRef.current.getReadyTasks(maxParallel)

      if (readyTasks.length === 0) {
        // Wait for running tasks to complete
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }

      // Execute ready tasks in parallel
      const promises = readyTasks.map(task => executeTask(task))
      await Promise.allSettled(promises)
    }

    // All tasks completed
    if (isMounted()) {
      executionStateRef.current.isRunning = false

      if (onAllComplete) {
        onAllComplete(executionStateRef.current.results)
      }
    }
  }

  const executeTask = async (task: ImplementerTask): Promise<void> => {
    if (!isMounted() || !taskQueueRef.current || !workspaceManagerRef.current) {
      return
    }

    const workspaceManager = workspaceManagerRef.current
    const taskQueue = taskQueueRef.current

    taskQueue.markRunning(task.id)

    try {
      // Create workspace for task
      const workspacePath = await workspaceManager.createWorkspace(task.id)

      // Report progress
      if (onProgress) {
        onProgress(task.id, { status: 'starting', message: 'Creating workspace' })
      }

      // Create implementation function that includes workspace setup
      const implementationWithWorkspace = async (): Promise<string> => {
        // Copy relevant files to workspace
        if (task.files && task.files.length > 0) {
          await workspaceManager.copyFiles(process.cwd(), workspacePath, task.files)
        }

        // Install dependencies if package.json exists
        const installResult = await workspaceManager.installDependencies(workspacePath)
        if (!installResult.success) {
          console.warn('Failed to install dependencies:', installResult.stderr)
        }

        // Execute the actual implementation
        return await task.implementation()
      }

      // Execute task with timeout
      const result = await workspaceManager.executeTask(
        task.id,
        implementationWithWorkspace,
        {
          timeout,
          retries: 1
        }
      )

      if (!isMounted()) {
        return
      }

      if (result.success) {
        // Run tests if requested
        if (runTestsAfterTask && testRunner) {
          try {
            if (onProgress) {
              onProgress(task.id, { status: 'testing', message: 'Running tests' })
            }

            const testResult = await testRunner.runTests(workspacePath)
            if (!testResult.passed) {
              throw new Error('Tests failed after implementation')
            }

            if (onProgress) {
              onProgress(task.id, { status: 'tested', message: 'Tests passed' })
            }
          } catch (testError) {
            console.warn(`Tests failed for task ${task.id}:`, testError)
            // Continue execution even if tests fail
          }
        }

        taskQueue.markCompleted(task.id)
        executionStateRef.current.results.push({
          taskId: task.id,
          success: true,
          result: result.output
        })

        if (onComplete) {
          onComplete(task.id, result.output)
        }

        if (onProgress) {
          onProgress(task.id, { status: 'completed', message: result.output })
        }

      } else {
        taskQueue.markFailed(task.id)
        executionStateRef.current.results.push({
          taskId: task.id,
          success: false,
          error: result.error
        })

        if (result.error?.includes('timeout')) {
          if (onTimeout) {
            onTimeout(task.id)
          }
        } else if (onError) {
          onError(task.id, result.error || 'Unknown error')
        }

        if (onProgress) {
          onProgress(task.id, { status: 'failed', message: result.error })
        }
      }

    } catch (error) {
      if (!isMounted()) {
        return
      }

      const errorMessage = error instanceof Error ? error.message : String(error)

      taskQueue.markFailed(task.id)
      executionStateRef.current.results.push({
        taskId: task.id,
        success: false,
        error: errorMessage
      })

      if (onError) {
        onError(task.id, errorMessage)
      }

      if (onProgress) {
        onProgress(task.id, { status: 'failed', message: errorMessage })
      }

    } finally {
      // Cleanup workspace
      if (workspaceManagerRef.current) {
        workspaceManagerRef.current.cleanupWorkspace(task.id)
      }
    }
  }

  const getExecutionStatus = () => {
    if (!taskQueueRef.current) {
      return { total: 0, completed: 0, failed: 0, running: 0, pending: 0 }
    }
    return taskQueueRef.current.getStatus()
  }

  const getCurrentResults = () => {
    return executionStateRef.current.results
  }

  const isRunning = () => {
    return executionStateRef.current.isRunning
  }

  // Component props for external access
  const implementerApi = {
    getStatus: getExecutionStatus,
    getResults: getCurrentResults,
    isRunning
  }

  // Store API in ref for external access
  const apiRef = useRef(implementerApi)
  apiRef.current = implementerApi

  return (
    <div className="implementer-engine">
      <div className="header">
        <h2>Implementation Engine</h2>
        <div className="status">
          {(() => {
            const status = getExecutionStatus()
            return (
              <span>
                {status.completed}/{status.total} completed
                {status.running > 0 && `, ${status.running} running`}
                {status.failed > 0 && `, ${status.failed} failed`}
              </span>
            )
          })()}
        </div>
      </div>

      <div className="tasks">
        {tasks.map(task => (
          <TaskStatus
            key={task.id}
            task={task}
            result={executionStateRef.current.results.find(r => r.taskId === task.id)}
            isRunning={taskQueueRef.current?.running.has(task.id) || false}
          />
        ))}
      </div>

      {executionStateRef.current.isRunning && (
        <div className="execution-progress">
          <div className="spinner">⏳</div>
          <span>Executing tasks in parallel...</span>
        </div>
      )}
    </div>
  )
}

/**
 * Individual task status component
 */
interface TaskStatusProps {
  task: ImplementerTask
  result?: { taskId: string; success: boolean; result?: string; error?: string }
  isRunning: boolean
}

function TaskStatus({ task, result, isRunning }: TaskStatusProps) {
  const getStatusIcon = () => {
    if (isRunning) return '⏳'
    if (result?.success) return '✅'
    if (result && !result.success) return '❌'
    return '⏸️'
  }

  const getStatusText = () => {
    if (isRunning) return 'Running'
    if (result?.success) return 'Completed'
    if (result && !result.success) return 'Failed'
    return 'Pending'
  }

  return (
    <div className={`task-status ${getStatusText().toLowerCase()}`}>
      <div className="task-header">
        <span className="status-icon">{getStatusIcon()}</span>
        <span className="task-id">{task.id}</span>
        <span className="status-text">{getStatusText()}</span>
      </div>

      <div className="task-description">{task.description}</div>

      {task.files && task.files.length > 0 && (
        <div className="task-files">
          <span>Files: {task.files.join(', ')}</span>
        </div>
      )}

      {task.dependencies && task.dependencies.length > 0 && (
        <div className="task-dependencies">
          <span>Depends on: {task.dependencies.join(', ')}</span>
        </div>
      )}

      {result?.result && (
        <div className="task-result">
          <details>
            <summary>Result</summary>
            <pre>{result.result}</pre>
          </details>
        </div>
      )}

      {result?.error && (
        <div className="task-error">
          <details>
            <summary>Error</summary>
            <pre>{result.error}</pre>
          </details>
        </div>
      )}
    </div>
  )
}