// Hook for connecting to Smithers database
// Provides reactive access to execution data

import { useState, useEffect } from 'react'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'

export interface Execution {
  id: string
  name: string | null
  status: string
  file_path: string
  started_at: string | null
  completed_at: string | null
  total_iterations: number
  total_agents: number
  total_tool_calls: number
}

export interface UseSmithersConnectionResult {
  db: SmithersDB | null
  isConnected: boolean
  error: string | null
  currentExecution: Execution | null
  executions: Execution[]
}

export function useSmithersConnection(dbPath: string): UseSmithersConnectionResult {
  const [db, setDb] = useState<SmithersDB | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentExecution, setCurrentExecution] = useState<Execution | null>(null)
  const [executions, setExecutions] = useState<Execution[]>([])

  useEffect(() => {
    let smithersDb: SmithersDB | null = null
    let pollInterval: ReturnType<typeof setInterval> | null = null

    const connect = () => {
      try {
        const fullPath = dbPath.endsWith('.db')
          ? dbPath
          : `${dbPath}/smithers.db`

        smithersDb = createSmithersDB({ path: fullPath })
        setDb(smithersDb)
        setIsConnected(true)
        setError(null)

        // Poll for updates (since we're in a different process)
        const pollData = () => {
          try {
            // Get current execution - convert to our Execution type
            const current = smithersDb?.execution.current()
            if (current) {
              setCurrentExecution({
                ...current,
                started_at: current.started_at?.toISOString() ?? null,
                completed_at: current.completed_at?.toISOString() ?? null
              } as Execution)
            } else {
              setCurrentExecution(null)
            }

            // Get all executions - convert to our Execution type
            const allExecs = smithersDb?.execution.list() ?? []
            setExecutions(allExecs.map(e => ({
              ...e,
              started_at: e.started_at?.toISOString() ?? null,
              completed_at: e.completed_at?.toISOString() ?? null
            })) as Execution[])
          } catch {
            // Ignore polling errors
          }
        }

        // Initial poll
        pollData()

        // Poll every 500ms for updates
        pollInterval = setInterval(pollData, 500)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Connection failed')
        setIsConnected(false)
      }
    }

    connect()

    return () => {
      if (pollInterval) clearInterval(pollInterval)
      if (smithersDb) smithersDb.close()
    }
  }, [dbPath])

  return {
    db,
    isConnected,
    error,
    currentExecution,
    executions
  }
}
