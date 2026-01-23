/**
 * Unit tests for core round-robin functionality
 * Tests the underlying logic without React hooks
 */

import { test, expect } from 'bun:test'
import { AgentRotator } from '../../src/agents/AgentRotator'
import { initializeRoundRobinDb, RoundRobinQueries } from '../../src/database/roundRobinSchema'
import type { RoundRobinAgent } from '../../src/hooks/useRoundRobin'

const testAgents: RoundRobinAgent[] = [
  { id: 'agent1', name: 'Agent One', type: 'worker' },
  { id: 'agent2', name: 'Agent Two', type: 'worker' },
  { id: 'agent3', name: 'Agent Three', type: 'supervisor' },
]

test('RoundRobinCore can execute tasks with persistence', async () => {
  // Set up database and rotator
  const db = initializeRoundRobinDb(':memory:')
  const queries = new RoundRobinQueries(db)
  const rotator = new AgentRotator(testAgents)

  // Insert agents into database
  queries.insertAgentsBatch(testAgents)

  // Define mock task
  const mockTask = async (agent: RoundRobinAgent) => ({
    message: `Task completed by ${agent.name}`,
    agentId: agent.id,
  })

  // Execute tasks in round-robin fashion
  const results = []

  for (let i = 0; i < 4; i++) {
    const agent = rotator.getNext()
    expect(agent).not.toBeNull()

    const startTime = Date.now()

    try {
      const taskResult = await mockTask(agent!)
      const executionTime = Date.now() - startTime

      // Record execution in database
      queries.insertExecution({
        agent_id: agent!.id,
        success: true,
        result: JSON.stringify(taskResult),
        execution_time: executionTime
      })

      results.push({
        success: true,
        agent: agent!,
        result: taskResult,
        execution_time: executionTime
      })
    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      queries.insertExecution({
        agent_id: agent!.id,
        success: false,
        error: errorMessage,
        execution_time: executionTime
      })

      results.push({
        success: false,
        agent: agent!,
        error: errorMessage,
        execution_time: executionTime
      })
    }
  }

  // Verify round-robin behavior
  expect(results).toHaveLength(4)
  expect(results[0].agent).toEqual(testAgents[0])
  expect(results[1].agent).toEqual(testAgents[1])
  expect(results[2].agent).toEqual(testAgents[2])
  expect(results[3].agent).toEqual(testAgents[0]) // Wrapped around

  // Verify all executions succeeded
  expect(results.every(r => r.success)).toBe(true)

  // Check database contains execution records
  const history = queries.selectExecutionHistory(10)
  expect(history).toHaveLength(4)

  // Check statistics
  const stats = queries.selectExecutionStats() as any
  expect(stats.total_executions).toBe(4)
  expect(stats.successful_executions).toBe(4)

  // Check agent statistics
  const agentStats = queries.selectAgentStats()
  expect(agentStats).toHaveLength(3)

  // Agent1 should have 2 executions (positions 0 and 3)
  const agent1Stats = agentStats.find((s: any) => s.id === 'agent1') as any
  expect(agent1Stats.total_executions).toBe(2)

  db.close()
})

test('RoundRobinCore handles task failures with persistence', async () => {
  const db = initializeRoundRobinDb(':memory:')
  const queries = new RoundRobinQueries(db)
  const rotator = new AgentRotator(testAgents)

  // Insert agents
  queries.insertAgentsBatch(testAgents)

  const failingTask = async (agent: RoundRobinAgent) => {
    throw new Error(`Task failed for ${agent.name}`)
  }

  // Execute failing task
  const agent = rotator.getNext()
  expect(agent).not.toBeNull()

  const startTime = Date.now()
  let result

  try {
    await failingTask(agent!)
    result = { success: true }
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    queries.insertExecution({
      agent_id: agent!.id,
      success: false,
      error: errorMessage,
      execution_time: executionTime
    })

    result = {
      success: false,
      agent: agent!,
      error: errorMessage,
      execution_time: executionTime
    }
  }

  // Verify failure was recorded
  expect(result.success).toBe(false)
  expect(result.error).toBe('Task failed for Agent One')

  // Verify rotation continued despite failure
  expect(rotator.getCurrentIndex()).toBe(1)
  expect(rotator.getCurrentAgent()).toEqual(testAgents[1])

  // Check database recorded the failure
  const history = queries.selectExecutionHistory(1)
  expect(history).toHaveLength(1)
  expect(history[0].success).toBe(0) // SQLite uses 0 for false
  expect(history[0].error).toBe('Task failed for Agent One')

  db.close()
})

test('RoundRobinCore state persistence across instances', async () => {
  const dbPath = '/tmp/test-roundrobin-persistence.db'

  // First instance
  {
    const db = initializeRoundRobinDb(dbPath)
    const queries = new RoundRobinQueries(db)
    const rotator = new AgentRotator(testAgents)

    // Insert agents and execute some tasks
    queries.insertAgentsBatch(testAgents)

    // Move to second agent
    rotator.getNext() // agent1 (index 0 -> 1)

    // Record execution
    queries.insertExecution({
      agent_id: 'agent1',
      success: true,
      result: 'First execution',
      execution_time: 100
    })

    // Save rotator state
    const serializedState = JSON.stringify(rotator.serialize())
    queries.upsertState('rotator_state', serializedState)
    queries.upsertState('current_index', '1')

    db.close()
  }

  // Second instance - simulate restart
  {
    const db = initializeRoundRobinDb(dbPath)
    const queries = new RoundRobinQueries(db)

    // Load persisted agents
    const persistedAgents = queries.selectAllAgents() as RoundRobinAgent[]
    expect(persistedAgents).toHaveLength(3)

    // Load persisted rotator state
    const serializedState = queries.selectState('rotator_state')
    expect(serializedState).not.toBeNull()

    const rotator = AgentRotator.deserialize(
      JSON.parse(serializedState!),
      persistedAgents
    )

    // Verify state was restored
    expect(rotator.getCurrentIndex()).toBe(1)
    expect(rotator.getCurrentAgent()?.id).toBe(testAgents[1].id)
    expect(rotator.getCurrentAgent()?.name).toBe(testAgents[1].name)
    expect(rotator.getCurrentAgent()?.type).toBe(testAgents[1].type)

    // Verify execution history persisted
    const history = queries.selectExecutionHistory(10)
    expect(history).toHaveLength(1)
    expect(history[0].agent_id).toBe('agent1')
    expect(history[0].result).toBe('First execution')

    db.close()
  }

  // Clean up temp file
  try {
    require('fs').unlinkSync(dbPath)
  } catch {
    // Ignore cleanup errors
  }
})

test('RoundRobinCore concurrent execution prevention', async () => {
  const db = initializeRoundRobinDb(':memory:')
  const queries = new RoundRobinQueries(db)
  const rotator = new AgentRotator(testAgents)

  queries.insertAgentsBatch(testAgents)

  let isExecuting = false

  const concurrentTask = async (agent: RoundRobinAgent) => {
    if (isExecuting) {
      throw new Error('Execution already in progress')
    }

    isExecuting = true
    await new Promise(resolve => setTimeout(resolve, 50))
    isExecuting = false

    return { message: 'Task completed' }
  }

  // Start first execution
  const agent1 = rotator.getNext()
  const promise1 = concurrentTask(agent1!)

  // Try second execution immediately
  const agent2 = rotator.getNext()
  const promise2 = concurrentTask(agent2!)

  const results = await Promise.allSettled([promise1, promise2])

  // One should succeed, one should fail
  const successes = results.filter(r => r.status === 'fulfilled').length
  const failures = results.filter(r => r.status === 'rejected').length

  expect(successes).toBe(1)
  expect(failures).toBe(1)

  // The failure should be due to concurrent execution
  const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult
  expect(failure.reason.message).toBe('Execution already in progress')

  db.close()
})

test('RoundRobinCore filtering and statistics', () => {
  const db = initializeRoundRobinDb(':memory:')
  const queries = new RoundRobinQueries(db)
  const rotator = new AgentRotator(testAgents)

  queries.insertAgentsBatch(testAgents)

  // Test agent filtering
  const workerAgents = rotator.getAgentsByType('worker')
  const supervisorAgents = rotator.getAgentsByType('supervisor')

  expect(workerAgents).toHaveLength(2)
  expect(supervisorAgents).toHaveLength(1)

  // Test agent lookup
  const foundAgent = rotator.getAgentById('agent2')
  const notFoundAgent = rotator.getAgentById('nonexistent')

  expect(foundAgent).toEqual(testAgents[1])
  expect(notFoundAgent).toBeNull()

  // Test peek functionality
  const nextThree = rotator.peekNext(3)
  expect(nextThree).toHaveLength(3)
  expect(nextThree[0]).toEqual(testAgents[0])
  expect(nextThree[1]).toEqual(testAgents[1])
  expect(nextThree[2]).toEqual(testAgents[2])

  // Test execution distribution calculation
  const distribution = rotator.calculateExecutionDistribution(10)
  expect(distribution.get('agent1')).toBe(4) // 10 / 3 = 3 remainder 1, so 3 + 1
  expect(distribution.get('agent2')).toBe(3)
  expect(distribution.get('agent3')).toBe(3)

  db.close()
})

test('RoundRobinCore database cleanup and reset', () => {
  const db = initializeRoundRobinDb(':memory:')
  const queries = new RoundRobinQueries(db)

  // Insert test data
  queries.insertAgentsBatch(testAgents)
  queries.insertExecution({
    agent_id: 'agent1',
    success: true,
    result: 'Test result',
    execution_time: 100
  })
  queries.upsertState('test_key', 'test_value')

  // Verify data exists
  expect(queries.selectAllAgents()).toHaveLength(3)
  expect(queries.selectExecutionHistory(10)).toHaveLength(1)
  expect(queries.selectState('test_key')).toBe('test_value')

  // Clean up everything
  queries.deleteAllExecutions()
  queries.deleteAllAgents()
  queries.deleteAllState()

  // Verify cleanup
  expect(queries.selectAllAgents()).toHaveLength(0)
  expect(queries.selectExecutionHistory(10)).toHaveLength(0)
  expect(queries.selectState('test_key')).toBeNull()

  // Test database stats
  const stats = queries.getDbStats()
  expect(stats.agents).toBe(0)
  expect(stats.executions).toBe(0)
  expect(stats.stateEntries).toBe(0)

  db.close()
})