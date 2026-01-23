/**
 * RoundRobin React component for agent rotation UI
 * Provides terminal-style interface following project aesthetic guidelines
 */

import React, { useRef } from 'react'
import { useRoundRobin, type RoundRobinAgent, type ExecutionResult } from '../hooks/useRoundRobin'

export interface RoundRobinProps {
  /** Database path for SQLite persistence */
  dbPath?: string
  /** Initial agents to register */
  agents?: RoundRobinAgent[]
  /** Custom task executor function */
  taskExecutor?: (agent: RoundRobinAgent) => Promise<any>
  /** Filter agents by type */
  filterByType?: string
  /** Auto-start execution on mount */
  autoStart?: boolean
  /** Allow manual agent selection */
  allowManualSelection?: boolean
  /** Show detailed statistics */
  showDetailedStats?: boolean
  /** Execution complete callback */
  onExecutionComplete?: (result: ExecutionResult) => void
  /** Error callback */
  onError?: (error: string) => void
  /** Custom styling */
  style?: React.CSSProperties
}

/**
 * Default task executor for demonstration
 */
const defaultTaskExecutor = async (agent: RoundRobinAgent) => {
  // Simulate work with random delay
  const delay = Math.random() * 1000 + 500
  await new Promise(resolve => setTimeout(resolve, delay))

  return {
    message: `Task completed by ${agent.name}`,
    timestamp: new Date().toISOString(),
    duration: delay,
  }
}

/**
 * Terminal-style round-robin agent execution interface
 * Follows brutalist design from project guidelines
 */
export function RoundRobin({
  dbPath,
  agents = [],
  taskExecutor = defaultTaskExecutor,
  filterByType,
  autoStart = false,
  allowManualSelection = false,
  showDetailedStats = false,
  onExecutionComplete,
  onError,
  style = {},
}: RoundRobinProps): React.ReactElement {
  const hook = useRoundRobin({ dbPath, initialAgents: agents })
  const hasInitializedRef = useRef(false)

  // Initialize agents on mount
  React.useEffect(() => {
    if (!hasInitializedRef.current && agents.length > 0) {
      hasInitializedRef.current = true
      hook.registerAgents(agents).catch(error => {
        onError?.(error.message)
      })
    }
  }, [])

  // Auto-start execution if requested
  React.useEffect(() => {
    if (autoStart && hook.agents.length > 0 && hook.state.status === 'idle') {
      executeNext()
    }
  }, [autoStart, hook.agents.length])

  const executeNext = async () => {
    try {
      const result = await hook.executeNext(taskExecutor)
      onExecutionComplete?.(result)

      if (!result.success) {
        onError?.(result.error || 'Execution failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      onError?.(errorMessage)
    }
  }

  const resetRotation = async () => {
    try {
      await hook.reset()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      onError?.(errorMessage)
    }
  }

  const selectAgent = (agentId: string) => {
    if (!allowManualSelection) return

    const success = hook.setCurrentAgent(agentId)
    if (!success) {
      onError?.(`Failed to select agent: ${agentId}`)
    }
  }

  // Filter agents if type filter is specified
  const displayAgents = filterByType
    ? hook.getAgentsByType(filterByType)
    : hook.agents

  const stats = hook.getStats()
  const agentStats = showDetailedStats ? hook.getAgentStats() : []
  const executionHistory = hook.getExecutionHistory(10)

  const terminalStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    backgroundColor: '#000',
    color: '#fff',
    padding: '1rem',
    border: '1px solid #fff',
    minHeight: '400px',
    ...style,
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: '1rem',
    padding: '0.5rem',
    border: '1px solid #333',
  }

  const buttonStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    backgroundColor: '#000',
    color: '#fff',
    border: '1px solid #fff',
    padding: '0.25rem 0.5rem',
    margin: '0.25rem',
    cursor: 'pointer',
  }

  const disabledButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    color: '#666',
    cursor: 'not-allowed',
  }

  const successStyle: React.CSSProperties = {
    color: '#0f0',
    border: '1px solid #0f0',
    padding: '0.25rem',
  }

  const errorStyle: React.CSSProperties = {
    color: '#f00',
    border: '1px solid #f00',
    padding: '0.25rem',
  }

  return (
    <div style={terminalStyle}>
      <h3 style={{ margin: '0 0 1rem 0', borderBottom: '1px solid #fff', paddingBottom: '0.5rem' }}>
        ROUND-ROBIN AGENT EXECUTOR
      </h3>

      {/* Agent List */}
      <div style={sectionStyle}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#ccc' }}>
          AGENTS ({displayAgents.length})
          {filterByType && ` - FILTER: ${filterByType.toUpperCase()}`}
        </h4>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {displayAgents.map((agent) => (
            <div
              key={agent.id}
              style={{
                padding: '0.25rem 0.5rem',
                border: hook.state.currentAgent?.id === agent.id ? '1px solid #ff0' : '1px solid #666',
                backgroundColor: hook.state.currentAgent?.id === agent.id ? '#333' : 'transparent',
                cursor: allowManualSelection ? 'pointer' : 'default',
              }}
              onClick={() => selectAgent(agent.id)}
              data-testid={allowManualSelection ? 'agent-selector' : undefined}
            >
              {agent.name}
              <br />
              <span style={{ fontSize: '0.8em', color: '#999' }}>
                [{agent.type}]
              </span>
            </div>
          ))}
        </div>

        {displayAgents.length === 0 && (
          <div style={{ color: '#f00', fontStyle: 'italic' }}>
            NO AGENTS REGISTERED
          </div>
        )}
      </div>

      {/* Current Status */}
      <div style={sectionStyle}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#ccc' }}>STATUS</h4>

        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ color: '#999' }}>Current Agent: </span>
          <span data-testid="current-agent">
            {hook.state.currentAgent?.name || 'NONE'}
          </span>
        </div>

        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ color: '#999' }}>Status: </span>
          <span
            data-testid="status"
            style={{
              color: hook.state.status === 'running' ? '#ff0' :
                     hook.state.status === 'error' ? '#f00' : '#0f0'
            }}
          >
            {hook.state.status.toUpperCase()}
          </span>
        </div>

        {hook.state.error && (
          <div style={errorStyle} data-testid="error-message">
            ERROR: {hook.state.error}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={sectionStyle}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#ccc' }}>CONTROLS</h4>

        <button
          onClick={executeNext}
          disabled={hook.state.status === 'running' || displayAgents.length === 0}
          style={hook.state.status === 'running' || displayAgents.length === 0
            ? disabledButtonStyle
            : buttonStyle
          }
        >
          {hook.state.status === 'running' ? 'EXECUTING...' : 'EXECUTE NEXT'}
        </button>

        <button
          onClick={resetRotation}
          disabled={hook.state.status === 'running'}
          style={hook.state.status === 'running' ? disabledButtonStyle : buttonStyle}
        >
          RESET
        </button>
      </div>

      {/* Basic Statistics */}
      <div style={sectionStyle}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#ccc' }}>STATISTICS</h4>

        <div data-testid="execution-stats">
          <div>Total Executions: {stats.totalExecutions}</div>
          <div>Success Rate: {(stats.successRate * 100).toFixed(1)}%</div>
          <div>Current Index: {stats.currentIndex} / {stats.totalAgents}</div>
        </div>

        <div data-testid="agent-stats" style={{ marginTop: '0.5rem' }}>
          Total Agents: {stats.totalAgents}
        </div>
      </div>

      {/* Detailed Statistics */}
      {showDetailedStats && agentStats.length > 0 && (
        <div style={sectionStyle}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#ccc' }}>DETAILED STATISTICS</h4>

          <div data-testid="detailed-stats">
            <div>Average Execution Time: {stats.avgExecutionTime.toFixed(0)}ms</div>
            <div>Min/Max Execution Time: {stats.minExecutionTime}ms / {stats.maxExecutionTime}ms</div>
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            {agentStats.map((agentStat) => (
              <div key={agentStat.id} style={{ marginBottom: '0.25rem' }}>
                <span>{agentStat.name}: </span>
                <span data-testid="agent-execution-count">
                  {agentStat.total_executions}
                </span>
                <span style={{ color: '#999' }}>
                  {' '}executions ({(agentStat.success_rate * 100).toFixed(1)}% success)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution History */}
      {executionHistory.length > 0 && (
        <div style={sectionStyle}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#ccc' }}>
            EXECUTION HISTORY (RECENT 10)
          </h4>

          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {executionHistory.map((execution) => (
              <div
                key={execution.id}
                style={{
                  marginBottom: '0.25rem',
                  padding: '0.25rem',
                  border: `1px solid ${execution.success ? '#0f0' : '#f00'}`,
                  fontSize: '0.9em',
                }}
                data-testid="execution-history-item"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{execution.agent_name}</span>
                  <span style={{ color: execution.success ? '#0f0' : '#f00' }}>
                    {execution.success ? 'success' : 'failed'}
                  </span>
                </div>

                <div style={{ fontSize: '0.8em', color: '#999' }}>
                  {execution.execution_time}ms - {new Date(execution.created_at).toLocaleTimeString()}
                </div>

                {execution.error && (
                  <div style={{ fontSize: '0.8em', color: '#f00', marginTop: '0.25rem' }}>
                    {execution.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '1rem',
        paddingTop: '0.5rem',
        borderTop: '1px solid #333',
        fontSize: '0.8em',
        color: '#666'
      }}>
        {hook.agents.length > 0 && (
          <>
            Next {Math.min(3, hook.agents.length)} agents:{' '}
            {hook.peekNextAgents(3).map(a => a.name).join(' → ')}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Minimal round-robin display component for embedded usage
 */
export function RoundRobinMini({
  dbPath,
  agents = [],
  taskExecutor = defaultTaskExecutor,
  onExecutionComplete,
  onError,
}: Pick<RoundRobinProps, 'dbPath' | 'agents' | 'taskExecutor' | 'onExecutionComplete' | 'onError'>): React.ReactElement {
  const hook = useRoundRobin({ dbPath, initialAgents: agents })

  React.useEffect(() => {
    if (agents.length > 0) {
      hook.registerAgents(agents).catch(error => {
        onError?.(error.message)
      })
    }
  }, [])

  const executeNext = async () => {
    try {
      const result = await hook.executeNext(taskExecutor)
      onExecutionComplete?.(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      onError?.(errorMessage)
    }
  }

  return (
    <div style={{
      fontFamily: 'monospace',
      backgroundColor: '#000',
      color: '#fff',
      padding: '0.5rem',
      border: '1px solid #fff',
      display: 'inline-block',
    }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <span style={{ color: '#999' }}>Agent: </span>
        <span>{hook.state.currentAgent?.name || 'None'}</span>
        <span style={{ marginLeft: '1rem', color: '#999' }}>
          Status: <span style={{
            color: hook.state.status === 'running' ? '#ff0' :
                   hook.state.status === 'error' ? '#f00' : '#0f0'
          }}>
            {hook.state.status}
          </span>
        </span>
      </div>

      <button
        onClick={executeNext}
        disabled={hook.state.status === 'running'}
        style={{
          fontFamily: 'monospace',
          backgroundColor: '#000',
          color: hook.state.status === 'running' ? '#666' : '#fff',
          border: '1px solid #fff',
          padding: '0.25rem 0.5rem',
          cursor: hook.state.status === 'running' ? 'not-allowed' : 'pointer',
        }}
      >
        Execute Next
      </button>
    </div>
  )
}