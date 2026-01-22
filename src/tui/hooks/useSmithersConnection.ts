import { useRef } from 'react'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { useEffectOnValueChange } from '../../reconciler/hooks.js'
import { useTuiState } from '../state.js'

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

export interface UseSmithersConnectionOptions {
  createDb?: typeof createSmithersDB
  resolveDbPath?: (dbPath: string) => string
  pollIntervalMs?: number
}

const EMPTY_EXECUTIONS: Execution[] = []

export function useSmithersConnection(
  dbPath: string,
  options: UseSmithersConnectionOptions = {}
): UseSmithersConnectionResult {
  const dbRef = useRef<SmithersDB | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const keyBase = `tui:connection:${dbPath}`

  const [isConnected, setIsConnected] = useTuiState<boolean>(`${keyBase}:connected`, false)
  const [error, setError] = useTuiState<string | null>(`${keyBase}:error`, null)
  const [currentExecution, setCurrentExecution] = useTuiState<Execution | null>(`${keyBase}:currentExecution`, null)
  const [executions, setExecutions] = useTuiState<Execution[]>(`${keyBase}:executions`, EMPTY_EXECUTIONS)

  useEffectOnValueChange(dbPath, () => {
    const createDb = options.createDb ?? createSmithersDB
    const resolveDbPath = options.resolveDbPath ?? ((path: string) => (
      path.endsWith('.db') ? path : `${path}/smithers.db`
    ))
    const pollIntervalMs = options.pollIntervalMs ?? 500

    const cleanup = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      if (dbRef.current) {
        dbRef.current.close()
        dbRef.current = null
      }
    }

    cleanup()

    try {
      const fullPath = resolveDbPath(dbPath)
      const smithersDb = createDb({ path: fullPath })
      dbRef.current = smithersDb
      setIsConnected(true)
      setError(null)

      const pollData = () => {
        try {
          const current = smithersDb.execution.current()
          if (current) {
            setCurrentExecution({
              ...current,
              started_at: current.started_at?.toISOString() ?? null,
              completed_at: current.completed_at?.toISOString() ?? null
            } as Execution)
          } else {
            setCurrentExecution(null)
          }

          const allExecs = smithersDb.execution.list()
          setExecutions(allExecs.map(e => ({
            ...e,
            started_at: e.started_at?.toISOString() ?? null,
            completed_at: e.completed_at?.toISOString() ?? null
          })) as Execution[])
        } catch {
          // Ignore polling errors
        }
      }

      pollData()
      pollIntervalRef.current = setInterval(pollData, pollIntervalMs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
      setIsConnected(false)
      setCurrentExecution(null)
      setExecutions(EMPTY_EXECUTIONS)
    }

    return cleanup
  }, [dbPath, setCurrentExecution, setError, setExecutions, setIsConnected])

  return {
    db: dbRef.current,
    isConnected,
    error,
    currentExecution,
    executions
  }
}
