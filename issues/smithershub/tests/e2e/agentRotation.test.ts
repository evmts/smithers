/**
 * End-to-end tests for agent rotation system
 * Tests complete round-robin workflow with React components and real database
 */

import { test, expect, beforeEach, afterEach } from 'bun:test'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { Database } from 'bun:sqlite'
import { RoundRobin } from '../../src/components/RoundRobin'
import { initializeRoundRobinDb } from '../../src/database/roundRobinSchema'
import type { RoundRobinAgent } from '../../src/hooks/useRoundRobin'

const testAgents: RoundRobinAgent[] = [
  { id: 'worker1', name: 'Worker Agent 1', type: 'worker' },
  { id: 'worker2', name: 'Worker Agent 2', type: 'worker' },
  { id: 'supervisor1', name: 'Supervisor Agent 1', type: 'supervisor' },
]

// Mock task execution function
const createMockTask = (delay: number = 100, shouldFail: boolean = false) =>
  async (agent: RoundRobinAgent) => {
    await new Promise(resolve => setTimeout(resolve, delay))
    if (shouldFail) {
      throw new Error(`Task failed for agent ${agent.id}`)
    }
    return {
      success: true,
      result: `Task completed by ${agent.name}`,
      metadata: { agentId: agent.id, timestamp: Date.now() }
    }
  }

describe('Agent Rotation E2E', () => {
  let db: Database
  let tempDbPath: string

  beforeEach(() => {
    // Use temporary file database for e2e tests
    tempDbPath = `/tmp/test-roundrobin-${Date.now()}.db`
    db = initializeRoundRobinDb(tempDbPath)
  })

  afterEach(() => {
    db?.close()
    // Clean up temp file
    try {
      require('fs').unlinkSync(tempDbPath)
    } catch {
      // Ignore cleanup errors
    }
  })

  test('complete round-robin workflow with React component', async () => {
    render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        onExecutionComplete={(result) => {
          console.log('Execution complete:', result)
        }}
        onError={(error) => {
          console.error('Execution error:', error)
        }}
      />
    )

    // Verify agents are registered and displayed
    await waitFor(() => {
      expect(screen.getByText('Worker Agent 1')).toBeInTheDocument()
      expect(screen.getByText('Worker Agent 2')).toBeInTheDocument()
      expect(screen.getByText('Supervisor Agent 1')).toBeInTheDocument()
    })

    // Check current agent indicator
    expect(screen.getByTestId('current-agent')).toHaveTextContent('Worker Agent 1')

    // Execute first task
    const executeButton = screen.getByRole('button', { name: /execute next/i })
    fireEvent.click(executeButton)

    // Verify execution status
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('running')
    })

    // Wait for execution to complete
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle')
    }, { timeout: 5000 })

    // Verify agent rotation
    expect(screen.getByTestId('current-agent')).toHaveTextContent('Worker Agent 2')

    // Check execution history
    const historyItems = screen.getAllByTestId('execution-history-item')
    expect(historyItems).toHaveLength(1)
    expect(historyItems[0]).toHaveTextContent('Worker Agent 1')
    expect(historyItems[0]).toHaveTextContent('success')
  })

  test('handles multiple sequential executions', async () => {
    render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        taskExecutor={createMockTask(50)}
      />
    )

    const executeButton = screen.getByRole('button', { name: /execute next/i })

    // Execute three tasks sequentially
    for (let i = 0; i < 3; i++) {
      fireEvent.click(executeButton)

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('running')
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('idle')
      }, { timeout: 2000 })
    }

    // Verify agent rotation: should be back to first agent
    expect(screen.getByTestId('current-agent')).toHaveTextContent('Worker Agent 1')

    // Verify execution count
    const stats = screen.getByTestId('execution-stats')
    expect(stats).toHaveTextContent('Total Executions: 3')
    expect(stats).toHaveTextContent('Success Rate: 100%')
  })

  test('handles execution failures gracefully', async () => {
    render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        taskExecutor={createMockTask(50, true)} // Will fail
      />
    )

    const executeButton = screen.getByRole('button', { name: /execute next/i })
    fireEvent.click(executeButton)

    // Wait for execution to complete with error
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error')
    }, { timeout: 2000 })

    // Verify error display
    const errorDisplay = screen.getByTestId('error-message')
    expect(errorDisplay).toHaveTextContent('Task failed for agent worker1')

    // Verify agent still rotated despite error
    expect(screen.getByTestId('current-agent')).toHaveTextContent('Worker Agent 2')

    // Check execution history shows failure
    const historyItems = screen.getAllByTestId('execution-history-item')
    expect(historyItems).toHaveLength(1)
    expect(historyItems[0]).toHaveTextContent('failed')
  })

  test('persists state across component remounts', async () => {
    const { unmount } = render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        taskExecutor={createMockTask(50)}
      />
    )

    // Execute one task
    const executeButton = screen.getByRole('button', { name: /execute next/i })
    fireEvent.click(executeButton)

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle')
    }, { timeout: 2000 })

    // Verify state before unmount
    expect(screen.getByTestId('current-agent')).toHaveTextContent('Worker Agent 2')

    // Unmount and remount component
    unmount()

    render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        taskExecutor={createMockTask(50)}
      />
    )

    // Verify state persisted
    await waitFor(() => {
      expect(screen.getByTestId('current-agent')).toHaveTextContent('Worker Agent 2')
    })

    // Verify execution history persisted
    const historyItems = screen.getAllByTestId('execution-history-item')
    expect(historyItems).toHaveLength(1)
  })

  test('supports agent filtering and type-based selection', async () => {
    render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        filterByType="worker"
      />
    )

    // Should only show worker agents
    await waitFor(() => {
      expect(screen.getByText('Worker Agent 1')).toBeInTheDocument()
      expect(screen.getByText('Worker Agent 2')).toBeInTheDocument()
      expect(screen.queryByText('Supervisor Agent 1')).not.toBeInTheDocument()
    })

    // Agent count should reflect filtered agents
    const stats = screen.getByTestId('agent-stats')
    expect(stats).toHaveTextContent('Total Agents: 2')
  })

  test('handles concurrent execution prevention', async () => {
    render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        taskExecutor={createMockTask(1000)} // Long running task
      />
    )

    const executeButton = screen.getByRole('button', { name: /execute next/i })

    // Start first execution
    fireEvent.click(executeButton)

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('running')
    })

    // Try to start second execution
    fireEvent.click(executeButton)

    // Button should be disabled during execution
    expect(executeButton).toBeDisabled()

    // Wait for execution to complete
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle')
    }, { timeout: 5000 })

    // Button should be enabled again
    expect(executeButton).not.toBeDisabled()
  })

  test('supports manual agent selection and reset', async () => {
    render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        allowManualSelection={true}
      />
    )

    // Use manual selection to jump to supervisor
    const supervisorButton = screen.getByRole('button', { name: /supervisor agent 1/i })
    fireEvent.click(supervisorButton)

    expect(screen.getByTestId('current-agent')).toHaveTextContent('Supervisor Agent 1')

    // Reset to first agent
    const resetButton = screen.getByRole('button', { name: /reset/i })
    fireEvent.click(resetButton)

    expect(screen.getByTestId('current-agent')).toHaveTextContent('Worker Agent 1')

    // Verify execution history was cleared
    const historyItems = screen.queryAllByTestId('execution-history-item')
    expect(historyItems).toHaveLength(0)
  })

  test('provides real-time execution statistics', async () => {
    render(
      <RoundRobin
        dbPath={tempDbPath}
        agents={testAgents}
        autoStart={false}
        taskExecutor={createMockTask(100)}
        showDetailedStats={true}
      />
    )

    const executeButton = screen.getByRole('button', { name: /execute next/i })

    // Execute multiple tasks
    for (let i = 0; i < 5; i++) {
      fireEvent.click(executeButton)

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('idle')
      }, { timeout: 2000 })
    }

    // Check detailed statistics
    const stats = screen.getByTestId('detailed-stats')
    expect(stats).toHaveTextContent('Total Executions: 5')
    expect(stats).toHaveTextContent('Average Execution Time:')
    expect(stats).toHaveTextContent('Success Rate: 100%')

    // Check per-agent statistics
    const agentStats = screen.getAllByTestId('agent-execution-count')
    expect(agentStats).toHaveLength(3)

    // Worker agents should each have 2 executions, supervisor should have 1
    // (5 executions across 3 agents in round-robin: 2, 2, 1)
    const counts = agentStats.map(el => parseInt(el.textContent || '0'))
    expect(counts.sort()).toEqual([1, 2, 2])
  })
})