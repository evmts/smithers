/**
 * Hook for managing implementation task results with database persistence
 * Tracks execution state, handles timeouts, and provides real-time updates
 */

import { useRef } from 'react'
import { useMount, useUnmount, useMountedState } from '../reconciler/hooks'
import { Database } from 'bun:sqlite'

// Import the database from the main project
let db: Database
try {
  const dbModule = require('../../../src/commands/db')
  db = dbModule.db
} catch {
  // Fallback for testing - create in-memory database with tables
  db = new Database(':memory:')
  db.run(`
    CREATE TABLE IF NOT EXISTS implementation_results (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      duration_ms INTEGER
    )
  `)
}

export interface ImplementationTask {
  id: string
  description: string
  files: string[]
  implementation: () => Promise<string>
  dependencies?: string[]
  priority?: number
}

export interface ImplementationResult {
  id: string
  taskId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  result: string | null
  error: string | null
  startedAt: Date | null
  completedAt: Date | null
  duration: number | null
}

export interface UseImplementationResultOptions {
  timeout?: number
  retries?: number
  onProgress?: (progress: { status: string; message?: string }) => void
  onComplete?: (result: string) => void
  onError?: (error: string) => void
  onTimeout?: () => void
}

export interface UseImplementationResultReturn {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  result: string | null
  error: string | null
  isRunning: boolean
  isComplete: boolean
  duration: number | null
  startImplementation: (task: ImplementationTask) => Promise<void>
  cancel: () => void
  retry: () => void
}

/**
 * Hook for managing implementation results with database persistence
 */
export function useImplementationResult(
  taskId: string,
  options: UseImplementationResultOptions = {}
): UseImplementationResultReturn {
  const isMounted = useMountedState()
  const stateRef = useRef<{
    status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'
    result: string | null
    error: string | null
    startedAt: Date | null
    completedAt: Date | null
    duration: number | null
    currentTask: ImplementationTask | null
    abortController: AbortController | null
    timeoutHandle: NodeJS.Timeout | null
  }>({
    status: 'pending',
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
    duration: null,
    currentTask: null,
    abortController: null,
    timeoutHandle: null
  })

  // Initialize database table on mount
  useMount(() => {
    try {
      db.run(`
        CREATE TABLE IF NOT EXISTS implementation_results (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          status TEXT NOT NULL,
          result TEXT,
          error TEXT,
          started_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT,
          duration_ms INTEGER
        )
      `)
    } catch (error) {
      console.warn('Failed to initialize implementation_results table:', error)
    }

    // Load existing result from database
    loadFromDatabase()
  })

  // Cleanup on unmount
  useUnmount(() => {
    if (stateRef.current.abortController) {
      stateRef.current.abortController.abort()
    }
    if (stateRef.current.timeoutHandle) {
      clearTimeout(stateRef.current.timeoutHandle)
    }
  })

  const loadFromDatabase = () => {
    try {
      const existingResult = db.prepare(`
        SELECT * FROM implementation_results
        WHERE task_id = ?
        ORDER BY started_at DESC
        LIMIT 1
      `).get(taskId) as any

      if (existingResult) {
        stateRef.current = {
          ...stateRef.current,
          status: existingResult.status,
          result: existingResult.result,
          error: existingResult.error,
          startedAt: existingResult.started_at ? new Date(existingResult.started_at) : null,
          completedAt: existingResult.completed_at ? new Date(existingResult.completed_at) : null,
          duration: existingResult.duration_ms
        }
      }
    } catch (error) {
      console.warn('Failed to load implementation result from database:', error)
    }
  }

  const saveToDatabase = () => {
    if (!isMounted()) return

    try {
      const state = stateRef.current
      const id = `${taskId}_${Date.now()}`

      db.prepare(`
        INSERT OR REPLACE INTO implementation_results
        (id, task_id, status, result, error, started_at, completed_at, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        taskId,
        state.status,
        state.result,
        state.error,
        state.startedAt?.toISOString() || null,
        state.completedAt?.toISOString() || null,
        state.duration
      )
    } catch (error) {
      console.warn('Failed to save implementation result to database:', error)
    }
  }

  const updateStatus = (
    status: typeof stateRef.current.status,
    updates: Partial<typeof stateRef.current> = {}
  ) => {
    if (!isMounted()) return

    stateRef.current = {
      ...stateRef.current,
      status,
      ...updates
    }

    // Calculate duration if completing
    if ((status === 'completed' || status === 'failed' || status === 'timeout') &&
        stateRef.current.startedAt && !stateRef.current.duration) {
      stateRef.current.completedAt = new Date()
      stateRef.current.duration = stateRef.current.completedAt.getTime() - stateRef.current.startedAt.getTime()
    }

    saveToDatabase()

    // Call progress callback
    if (options.onProgress) {
      options.onProgress({ status, message: updates.result || updates.error || undefined })
    }
  }

  const startImplementation = async (task: ImplementationTask): Promise<void> => {
    if (stateRef.current.status === 'running') {
      return
    }

    // Reset state
    stateRef.current.currentTask = task
    stateRef.current.abortController = new AbortController()
    stateRef.current.startedAt = new Date()

    updateStatus('running', {
      result: null,
      error: null,
      completedAt: null,
      duration: null
    })

    // Set up timeout if specified
    if (options.timeout) {
      stateRef.current.timeoutHandle = setTimeout(() => {
        if (stateRef.current.status === 'running') {
          if (stateRef.current.abortController) {
            stateRef.current.abortController.abort()
          }
          updateStatus('timeout', { error: `Task timeout after ${options.timeout}ms` })
          if (options.onTimeout) {
            options.onTimeout()
          }
        }
      }, options.timeout)
    }

    try {
      // Execute the implementation
      const result = await task.implementation()

      if (!isMounted() || stateRef.current.status !== 'running') {
        return
      }

      // Clear timeout
      if (stateRef.current.timeoutHandle) {
        clearTimeout(stateRef.current.timeoutHandle)
        stateRef.current.timeoutHandle = null
      }

      updateStatus('completed', { result })

      if (options.onComplete) {
        options.onComplete(result)
      }

    } catch (error) {
      if (!isMounted()) {
        return
      }

      // Clear timeout
      if (stateRef.current.timeoutHandle) {
        clearTimeout(stateRef.current.timeoutHandle)
        stateRef.current.timeoutHandle = null
      }

      const errorMessage = error instanceof Error ? error.message : String(error)

      // Check if it was cancelled
      if (stateRef.current.status === 'cancelled' || errorMessage.includes('abort')) {
        updateStatus('cancelled', { error: 'Task was cancelled' })
      } else {
        updateStatus('failed', { error: errorMessage })

        if (options.onError) {
          options.onError(errorMessage)
        }
      }
    }
  }

  const cancel = () => {
    if (stateRef.current.status !== 'running') {
      return
    }

    if (stateRef.current.abortController) {
      stateRef.current.abortController.abort()
    }

    if (stateRef.current.timeoutHandle) {
      clearTimeout(stateRef.current.timeoutHandle)
      stateRef.current.timeoutHandle = null
    }

    updateStatus('cancelled', { error: 'Task was cancelled' })
  }

  const retry = async () => {
    if (!stateRef.current.currentTask) {
      return
    }

    // Reset error state
    stateRef.current.error = null
    stateRef.current.result = null
    stateRef.current.completedAt = null
    stateRef.current.duration = null

    await startImplementation(stateRef.current.currentTask)
  }

  return {
    status: stateRef.current.status,
    result: stateRef.current.result,
    error: stateRef.current.error,
    isRunning: stateRef.current.status === 'running',
    isComplete: stateRef.current.status === 'completed',
    duration: stateRef.current.duration,
    startImplementation,
    cancel,
    retry
  }
}