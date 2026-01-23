/**
 * Unit tests for useRoundRobin hook
 * Tests round-robin agent execution with SQLite persistence
 */

import { test, expect } from 'bun:test'
import { useRoundRobin, type RoundRobinAgent } from '../../src/hooks/useRoundRobin'

const testAgents: RoundRobinAgent[] = [
  { id: 'agent1', name: 'Agent One', type: 'worker' },
  { id: 'agent2', name: 'Agent Two', type: 'worker' },
  { id: 'agent3', name: 'Agent Three', type: 'supervisor' },
]

test('useRoundRobin initializes with empty state', () => {
  const hook = useRoundRobin({ autoInitialize: false })

  expect(hook.state.status).toBe('idle')
  expect(hook.state.currentAgent).toBeNull()
  expect(hook.state.executionHistory).toEqual([])
  expect(hook.state.error).toBeNull()
  expect(hook.agents).toEqual([])
})

test('useRoundRobin registers agents successfully', async () => {
  const hook = useRoundRobin({ autoInitialize: false })

  await hook.registerAgents(testAgents)

  expect(hook.agents).toEqual(testAgents)
  expect(hook.state.currentAgent).toEqual(testAgents[0])
})

test('useRoundRobin executes tasks in round-robin fashion', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const mockTask = async (agent: RoundRobinAgent) => ({
    message: `Task completed by ${agent.name}`,
    agentId: agent.id,
  })

  // First execution
  const result1 = await hook.executeNext(mockTask)
  expect(result1.success).toBe(true)
  expect(result1.agent).toEqual(testAgents[0])
  expect(result1.result?.agentId).toBe('agent1')

  // Second execution should move to next agent
  const result2 = await hook.executeNext(mockTask)
  expect(result2.success).toBe(true)
  expect(result2.agent).toEqual(testAgents[1])
  expect(result2.result?.agentId).toBe('agent2')

  // Third execution
  const result3 = await hook.executeNext(mockTask)
  expect(result3.success).toBe(true)
  expect(result3.agent).toEqual(testAgents[2])
  expect(result3.result?.agentId).toBe('agent3')

  // Fourth execution should wrap back to first agent
  const result4 = await hook.executeNext(mockTask)
  expect(result4.success).toBe(true)
  expect(result4.agent).toEqual(testAgents[0])
  expect(result4.result?.agentId).toBe('agent1')
})

test('useRoundRobin handles execution errors gracefully', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const mockFailingTask = async (agent: RoundRobinAgent) => {
    throw new Error(`Task failed for agent ${agent.id}`)
  }

  const result = await hook.executeNext(mockFailingTask)

  expect(result.success).toBe(false)
  expect(result.error).toBe('Task failed for agent agent1')
  expect(hook.state.status).toBe('error')
  expect(hook.state.error).toBe('Task failed for agent agent1')

  // Agent should still rotate despite error
  expect(hook.getCurrentAgent()).toEqual(testAgents[1])
})

test('useRoundRobin prevents concurrent executions', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const slowTask = async (agent: RoundRobinAgent) => {
    await new Promise(resolve => setTimeout(resolve, 100))
    return { success: true }
  }

  // Start first execution
  const promise1 = hook.executeNext(slowTask)

  // Try to start second execution immediately
  const promise2 = hook.executeNext(slowTask)

  const [result1, result2] = await Promise.all([promise1, promise2])

  expect(result1.success).toBe(true)
  expect(result2.success).toBe(false)
  expect(result2.error).toContain('already running')
})

test('useRoundRobin provides execution statistics', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const mockTask = async (agent: RoundRobinAgent) => ({ success: true })

  // Execute a few tasks
  await hook.executeNext(mockTask)
  await hook.executeNext(mockTask)

  const stats = hook.getStats()

  expect(stats.totalAgents).toBe(3)
  expect(stats.totalExecutions).toBe(2)
  expect(stats.successfulExecutions).toBe(2)
  expect(stats.successRate).toBe(1.0)
  expect(stats.avgExecutionTime).toBeGreaterThan(0)
})

test('useRoundRobin resets state and clears database', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const mockTask = async (agent: RoundRobinAgent) => ({ success: true })

  // Execute some tasks
  await hook.executeNext(mockTask)
  await hook.executeNext(mockTask)

  // Verify we have data
  expect(hook.agents.length).toBe(3)
  expect(hook.getStats().totalExecutions).toBe(2)

  // Reset
  await hook.reset()

  // Verify state is cleared
  expect(hook.agents).toEqual([])
  expect(hook.state.currentAgent).toBeNull()
  expect(hook.getStats().totalExecutions).toBe(0)
})

test('useRoundRobin filters agents by type', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const workerAgents = hook.getAgentsByType('worker')
  const supervisorAgents = hook.getAgentsByType('supervisor')

  expect(workerAgents).toHaveLength(2)
  expect(workerAgents.every(a => a.type === 'worker')).toBe(true)

  expect(supervisorAgents).toHaveLength(1)
  expect(supervisorAgents[0].type).toBe('supervisor')
})

test('useRoundRobin finds agents by ID', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const foundAgent = hook.getAgentById('agent2')
  const notFoundAgent = hook.getAgentById('nonexistent')

  expect(foundAgent).toEqual(testAgents[1])
  expect(notFoundAgent).toBeNull()
})

test('useRoundRobin allows manual agent selection', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  // Initially should be at first agent
  expect(hook.getCurrentAgent()).toEqual(testAgents[0])

  // Manually set to third agent
  const success = hook.setCurrentAgent('agent3')
  expect(success).toBe(true)
  expect(hook.getCurrentAgent()).toEqual(testAgents[2])

  // Try to set invalid agent
  const failure = hook.setCurrentAgent('nonexistent')
  expect(failure).toBe(false)
})

test('useRoundRobin provides agent preview functionality', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const nextThree = hook.peekNextAgents(3)

  expect(nextThree).toHaveLength(3)
  expect(nextThree[0]).toEqual(testAgents[0]) // Current
  expect(nextThree[1]).toEqual(testAgents[1]) // Next
  expect(nextThree[2]).toEqual(testAgents[2]) // After that
})

test('useRoundRobin updates agents list', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const newAgents: RoundRobinAgent[] = [
    { id: 'new1', name: 'New Agent 1', type: 'worker' },
    { id: 'new2', name: 'New Agent 2', type: 'supervisor' },
  ]

  await hook.updateAgents(newAgents)

  expect(hook.agents).toEqual(newAgents)
  expect(hook.getCurrentAgent()).toEqual(newAgents[0])
})

test('useRoundRobin records and retrieves execution history', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const mockTask = async (agent: RoundRobinAgent) => ({
    message: `Task by ${agent.name}`,
  })

  // Execute some tasks
  await hook.executeNext(mockTask)
  await hook.executeNext(mockTask)

  const history = hook.getExecutionHistory(10)

  expect(history).toHaveLength(2)
  expect(history[0].agent_name).toBe('Agent Two') // Most recent first
  expect(history[1].agent_name).toBe('Agent One')
  expect(history.every(h => h.success === true)).toBe(true)
})

test('useRoundRobin provides detailed agent statistics', async () => {
  const hook = useRoundRobin({
    dbPath: ':memory:',
    initialAgents: testAgents
  })

  const mockTask = async (agent: RoundRobinAgent) => ({ success: true })

  // Execute several tasks to get varied statistics
  for (let i = 0; i < 5; i++) {
    await hook.executeNext(mockTask)
  }

  const agentStats = hook.getAgentStats()

  expect(agentStats).toHaveLength(3)

  // Each agent should have some executions
  const totalExecutions = agentStats.reduce((sum, stat) => sum + stat.total_executions, 0)
  expect(totalExecutions).toBe(5)

  // All should be successful
  expect(agentStats.every(stat => stat.success_rate === 1.0)).toBe(true)
})