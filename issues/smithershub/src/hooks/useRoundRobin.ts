/**
 * React hook for round-robin agent execution with SQLite persistence
 * Follows project patterns: no useState, useRef for non-reactive state, SQLite for persistence
 */

import { useRef } from 'react'
import { AgentRotator, type SerializedRotatorState } from '../agents/AgentRotator'
import { initializeRoundRobinDb, RoundRobinQueries } from '../database/roundRobinSchema'
import type { Database } from 'bun:sqlite'

export interface RoundRobinAgent {
  id: string
  name: string
  type: string
  priority?: number
  metadata?: Record<string, any>
}

export interface RoundRobinState {
  status: 'idle' | 'running' | 'error'
  currentAgent: RoundRobinAgent | null
  executionHistory: ExecutionRecord[]
  error: string | null
}

export interface ExecutionRecord {
  id: number
  agent_id: string
  agent_name: string
  agent_type: string
  success: boolean
  result?: string
  error?: string
  execution_time: number
  created_at: string
}

export interface ExecutionResult<T = any> {
  success: boolean
  result?: T
  error?: string
  execution_time: number
  agent: RoundRobinAgent
}

export interface ExecutionStats {
  currentIndex: number
  totalAgents: number
  totalExecutions: number
  successfulExecutions: number
  successRate: number
  avgExecutionTime: number
  minExecutionTime: number
  maxExecutionTime: number
}

export interface AgentStats {
  id: string
  name: string
  type: string
  total_executions: number
  successful_executions: number
  success_rate: number
  avg_execution_time: number
}

export interface UseRoundRobinOptions {
  dbPath?: string
  initialAgents?: RoundRobinAgent[]
  autoInitialize?: boolean
}

export interface UseRoundRobinHook {
  // State getters (following existing patterns)
  readonly state: RoundRobinState
  readonly agents: RoundRobinAgent[]
  readonly currentIndex: number

  // Core operations
  registerAgents(agents: RoundRobinAgent[]): Promise<void>
  executeNext<T = any>(
    taskFn: (agent: RoundRobinAgent) => Promise<T>
  ): Promise<ExecutionResult<T>>
  reset(): Promise<void>

  // Statistics and queries
  getStats(): ExecutionStats
  getAgentStats(): AgentStats[]
  getExecutionHistory(limit?: number): ExecutionRecord[]

  // Agent management
  getAgentsByType(type: string): RoundRobinAgent[]
  getAgentById(id: string): RoundRobinAgent | null
  updateAgents(agents: RoundRobinAgent[]): Promise<void>

  // Manual control
  setCurrentAgent(agentId: string): boolean
  getCurrentAgent(): RoundRobinAgent | null
  peekNextAgents(count: number): RoundRobinAgent[]
}

/**
 * React hook for round-robin agent execution with SQLite persistence
 * Uses useRef for non-reactive state as per project guidelines
 */
export function useRoundRobin(options: UseRoundRobinOptions = {}): UseRoundRobinHook {
  const {
    dbPath = ':memory:',
    initialAgents = [],
    autoInitialize = true
  } = options

  // Non-reactive state using useRef (following project patterns)
  const stateRef = useRef<RoundRobinState>({
    status: 'idle',
    currentAgent: null,
    executionHistory: [],
    error: null,
  })

  // Database and rotator instances
  const dbRef = useRef<Database | null>(null)
  const queriesRef = useRef<RoundRobinQueries | null>(null)
  const rotatorRef = useRef<AgentRotator | null>(null)
  const agentsRef = useRef<RoundRobinAgent[]>([])

  // Force re-render counter (minimal reactive state)
  const forceUpdateRef = useRef(0)

  // Initialize database and load persisted state
  const initializeDb = () => {
    if (!dbRef.current) {
      dbRef.current = initializeRoundRobinDb(dbPath)
      queriesRef.current = new RoundRobinQueries(dbRef.current)

      // Load persisted agents
      const persistedAgents = queriesRef.current.selectAllAgents() as RoundRobinAgent[]
      if (persistedAgents.length > 0) {
        agentsRef.current = persistedAgents
      } else if (initialAgents.length > 0) {
        // Initialize with provided agents
        agentsRef.current = [...initialAgents]
        queriesRef.current.insertAgentsBatch(initialAgents)
      }

      // Initialize rotator with loaded agents
      rotatorRef.current = new AgentRotator(agentsRef.current)

      // Load persisted rotation state
      const serializedState = queriesRef.current.selectState('rotator_state')
      if (serializedState) {
        try {
          const state: SerializedRotatorState = JSON.parse(serializedState)
          rotatorRef.current = AgentRotator.deserialize(state, agentsRef.current)
        } catch (error) {
          console.warn('Failed to deserialize rotator state, using defaults:', error)
        }
      }

      // Load execution history
      stateRef.current.executionHistory = queriesRef.current.selectExecutionHistory(50)

      // Set current agent
      stateRef.current.currentAgent = rotatorRef.current.getCurrentAgent()
    }
  }

  // Initialize on first use if autoInitialize is enabled
  if (autoInitialize && !dbRef.current) {
    initializeDb()
  }

  const updateState = (updates: Partial<RoundRobinState>) => {
    Object.assign(stateRef.current, updates)
    forceUpdateRef.current += 1
    // Note: In real React usage, this would trigger a re-render
  }

  const persistRotatorState = () => {
    if (rotatorRef.current && queriesRef.current) {
      const serializedState = JSON.stringify(rotatorRef.current.serialize())
      queriesRef.current.upsertState('rotator_state', serializedState)
    }
  }

  const registerAgents = async (agents: RoundRobinAgent[]): Promise<void> => {
    if (!queriesRef.current || !rotatorRef.current) {
      initializeDb()
    }

    try {
      // Validate agents
      if (!agents.length) {
        throw new Error('No agents provided')
      }

      // Store in database
      queriesRef.current!.insertAgentsBatch(agents)

      // Update in-memory state
      agentsRef.current = [...agents]
      rotatorRef.current!.updateAgents(agents)

      // Update current agent
      updateState({
        currentAgent: rotatorRef.current!.getCurrentAgent(),
        error: null,
      })

      persistRotatorState()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateState({ error: errorMessage })
      throw error
    }
  }

  const executeNext = async <T = any>(
    taskFn: (agent: RoundRobinAgent) => Promise<T>
  ): Promise<ExecutionResult<T>> => {
    if (!rotatorRef.current || !queriesRef.current) {
      throw new Error('Round robin not initialized')
    }

    if (stateRef.current.status === 'running') {
      return {
        success: false,
        error: 'Execution already running',
        execution_time: 0,
        agent: stateRef.current.currentAgent!,
      }
    }

    const agent = rotatorRef.current.getNext()
    if (!agent) {
      throw new Error('No agents available for execution')
    }

    updateState({ status: 'running', error: null })

    const startTime = Date.now()
    let result: ExecutionResult<T>

    try {
      const taskResult = await taskFn(agent)

      const executionTime = Date.now() - startTime
      result = {
        success: true,
        result: taskResult,
        execution_time: executionTime,
        agent,
      }

      // Record successful execution
      queriesRef.current.insertExecution({
        agent_id: agent.id,
        success: true,
        result: JSON.stringify(taskResult),
        execution_time: executionTime,
      })

      updateState({ status: 'idle', currentAgent: rotatorRef.current.getCurrentAgent() })

    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      result = {
        success: false,
        error: errorMessage,
        execution_time: executionTime,
        agent,
      }

      // Record failed execution
      queriesRef.current.insertExecution({
        agent_id: agent.id,
        success: false,
        error: errorMessage,
        execution_time: executionTime,
      })

      updateState({
        status: 'error',
        error: errorMessage,
        currentAgent: rotatorRef.current.getCurrentAgent(),
      })
    }

    // Update execution history
    stateRef.current.executionHistory = queriesRef.current.selectExecutionHistory(50)

    // Persist rotator state
    persistRotatorState()

    return result
  }

  const reset = async (): Promise<void> => {
    if (!queriesRef.current || !rotatorRef.current) {
      return
    }

    try {
      // Clear database
      queriesRef.current.deleteAllExecutions()
      queriesRef.current.deleteAllAgents()
      queriesRef.current.deleteAllState()

      // Reset in-memory state
      agentsRef.current = []
      rotatorRef.current.updateAgents([])

      updateState({
        status: 'idle',
        currentAgent: null,
        executionHistory: [],
        error: null,
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateState({ error: errorMessage })
      throw error
    }
  }

  const getStats = (): ExecutionStats => {
    if (!queriesRef.current || !rotatorRef.current) {
      return {
        currentIndex: 0,
        totalAgents: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        successRate: 0,
        avgExecutionTime: 0,
        minExecutionTime: 0,
        maxExecutionTime: 0,
      }
    }

    const dbStats = queriesRef.current.selectExecutionStats() as any
    const rotatorStats = rotatorRef.current.getRotationStats()

    return {
      currentIndex: rotatorStats.currentIndex,
      totalAgents: rotatorStats.totalAgents,
      totalExecutions: dbStats.total_executions || 0,
      successfulExecutions: dbStats.successful_executions || 0,
      successRate: dbStats.total_executions > 0
        ? (dbStats.successful_executions || 0) / dbStats.total_executions
        : 0,
      avgExecutionTime: dbStats.avg_execution_time || 0,
      minExecutionTime: dbStats.min_execution_time || 0,
      maxExecutionTime: dbStats.max_execution_time || 0,
    }
  }

  const getAgentStats = (): AgentStats[] => {
    if (!queriesRef.current) {
      return []
    }
    return queriesRef.current.selectAgentStats() as AgentStats[]
  }

  const getExecutionHistory = (limit: number = 50): ExecutionRecord[] => {
    if (!queriesRef.current) {
      return []
    }
    return queriesRef.current.selectExecutionHistory(limit) as ExecutionRecord[]
  }

  const getAgentsByType = (type: string): RoundRobinAgent[] => {
    return agentsRef.current.filter(agent => agent.type === type)
  }

  const getAgentById = (id: string): RoundRobinAgent | null => {
    return agentsRef.current.find(agent => agent.id === id) || null
  }

  const updateAgents = async (agents: RoundRobinAgent[]): Promise<void> => {
    // Clear existing agents and register new ones
    if (queriesRef.current) {
      queriesRef.current.deleteAllAgents()
    }
    await registerAgents(agents)
  }

  const setCurrentAgent = (agentId: string): boolean => {
    if (!rotatorRef.current) {
      return false
    }

    const agent = getAgentById(agentId)
    if (!agent) {
      return false
    }

    const agentIndex = agentsRef.current.findIndex(a => a.id === agentId)
    if (agentIndex < 0) {
      return false
    }

    try {
      rotatorRef.current.setCurrentIndex(agentIndex)
      updateState({ currentAgent: agent })
      persistRotatorState()
      return true
    } catch {
      return false
    }
  }

  const getCurrentAgent = (): RoundRobinAgent | null => {
    return rotatorRef.current?.getCurrentAgent() || null
  }

  const peekNextAgents = (count: number): RoundRobinAgent[] => {
    return rotatorRef.current?.peekNext(count) || []
  }

  return {
    // State getters (computed on access)
    get state() { return { ...stateRef.current } },
    get agents() { return [...agentsRef.current] },
    get currentIndex() { return rotatorRef.current?.getCurrentIndex() || 0 },

    // Core operations
    registerAgents,
    executeNext,
    reset,

    // Statistics and queries
    getStats,
    getAgentStats,
    getExecutionHistory,

    // Agent management
    getAgentsByType,
    getAgentById,
    updateAgents,

    // Manual control
    setCurrentAgent,
    getCurrentAgent,
    peekNextAgents,
  }
}