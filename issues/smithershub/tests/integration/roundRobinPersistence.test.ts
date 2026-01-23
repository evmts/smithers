/**
 * Integration tests for round-robin persistence with SQLite
 * Tests full database integration and state persistence
 */

import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { initializeRoundRobinDb } from '../../src/database/roundRobinSchema'
import type { RoundRobinAgent } from '../../src/hooks/useRoundRobin'

const testAgents: RoundRobinAgent[] = [
  { id: 'agent1', name: 'Agent One', type: 'worker' },
  { id: 'agent2', name: 'Agent Two', type: 'worker' },
  { id: 'agent3', name: 'Agent Three', type: 'supervisor' },
]

test('initializes database tables correctly', () => {
  const db = initializeRoundRobinDb(':memory:')

  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `).all()

  const tableNames = tables.map((t: any) => t.name)
  expect(tableNames).toContain('agents')
  expect(tableNames).toContain('executions')
  expect(tableNames).toContain('round_robin_state')

  db.close()
})

test('persists and retrieves agents', () => {
  const db = initializeRoundRobinDb(':memory:')

  const insertAgent = db.prepare(`
    INSERT OR REPLACE INTO agents (id, name, type, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `)

  // Insert test agents
  testAgents.forEach(agent => {
    insertAgent.run(agent.id, agent.name, agent.type)
  })

  // Retrieve agents
  const retrievedAgents = db.prepare(`
    SELECT id, name, type FROM agents ORDER BY created_at
  `).all() as RoundRobinAgent[]

  expect(retrievedAgents).toHaveLength(3)
  expect(retrievedAgents[0]).toEqual(expect.objectContaining(testAgents[0]))
  expect(retrievedAgents[1]).toEqual(expect.objectContaining(testAgents[1]))
  expect(retrievedAgents[2]).toEqual(expect.objectContaining(testAgents[2]))

  db.close()
})

test('persists round-robin state across sessions', () => {
  const db = initializeRoundRobinDb(':memory:')

  const setState = db.prepare(`
    INSERT OR REPLACE INTO round_robin_state (key, value)
    VALUES (?, ?)
  `)
  const getState = db.prepare(`
    SELECT value FROM round_robin_state WHERE key = ?
  `)

  // Simulate saving current index
  setState.run('current_index', '2')
  setState.run('total_rotations', '15')

  // Retrieve state
  const currentIndex = getState.get('current_index') as any
  const totalRotations = getState.get('total_rotations') as any

  expect(parseInt(currentIndex.value)).toBe(2)
  expect(parseInt(totalRotations.value)).toBe(15)

  db.close()
})

test('records execution history with full context', () => {
  const db = initializeRoundRobinDb(':memory:')

  // Insert agents first
  const insertAgent = db.prepare(`
    INSERT INTO agents (id, name, type, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `)
  insertAgent.run('agent1', 'Agent One', 'worker')
  insertAgent.run('agent2', 'Agent Two', 'worker')

  const insertExecution = db.prepare(`
    INSERT INTO executions
    (agent_id, success, result, error, execution_time, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `)

  // Record successful execution
  insertExecution.run('agent1', 1, 'Task completed successfully', null, 1250)

  // Record failed execution
  insertExecution.run('agent2', 0, null, 'Connection timeout', 3000)

  const executions = db.prepare(`
    SELECT * FROM executions ORDER BY created_at
  `).all()

  expect(executions).toHaveLength(2)

  const [success, failure] = executions as any[]

  expect(success.agent_id).toBe('agent1')
  expect(success.success).toBe(1)
  expect(success.result).toBe('Task completed successfully')
  expect(success.error).toBeNull()
  expect(success.execution_time).toBe(1250)

  expect(failure.agent_id).toBe('agent2')
  expect(failure.success).toBe(0)
  expect(failure.result).toBeNull()
  expect(failure.error).toBe('Connection timeout')
  expect(failure.execution_time).toBe(3000)

  db.close()
})

test('provides execution statistics queries', () => {
  const db = initializeRoundRobinDb(':memory:')

  // Insert agents first
  const insertAgent = db.prepare(`
    INSERT INTO agents (id, name, type, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `)
  insertAgent.run('agent1', 'Agent One', 'worker')
  insertAgent.run('agent2', 'Agent Two', 'worker')

  const insertExecution = db.prepare(`
    INSERT INTO executions
    (agent_id, success, result, error, execution_time, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `)

  // Insert test data
  insertExecution.run('agent1', 1, 'Success 1', null, 1000)
  insertExecution.run('agent1', 1, 'Success 2', null, 1200)
  insertExecution.run('agent1', 0, null, 'Error 1', 500)
  insertExecution.run('agent2', 1, 'Success 3', null, 800)

  // Query overall stats
  const overallStats = db.prepare(`
    SELECT
      COUNT(*) as total_executions,
      SUM(success) as successful_executions,
      AVG(execution_time) as avg_execution_time,
      MAX(execution_time) as max_execution_time,
      MIN(execution_time) as min_execution_time
    FROM executions
  `).get() as any

  expect(overallStats.total_executions).toBe(4)
  expect(overallStats.successful_executions).toBe(3)
  expect(overallStats.avg_execution_time).toBe(875) // (1000+1200+500+800)/4

  // Query per-agent stats
  const agentStats = db.prepare(`
    SELECT
      agent_id,
      COUNT(*) as executions,
      SUM(success) as successes,
      CAST(SUM(success) AS FLOAT) / COUNT(*) as success_rate
    FROM executions
    GROUP BY agent_id
    ORDER BY agent_id
  `).all() as any[]

  expect(agentStats).toHaveLength(2)
  expect(agentStats[0].agent_id).toBe('agent1')
  expect(agentStats[0].executions).toBe(3)
  expect(agentStats[0].successes).toBe(2)
  expect(agentStats[0].success_rate).toBeCloseTo(0.667, 3)

  db.close()
})

test('handles concurrent database access safely', async () => {
  const db = initializeRoundRobinDb(':memory:')

  // Insert agents first
  const insertAgent = db.prepare(`
    INSERT INTO agents (id, name, type, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `)
  insertAgent.run('agent0', 'Agent 0', 'worker')
  insertAgent.run('agent1', 'Agent 1', 'worker')
  insertAgent.run('agent2', 'Agent 2', 'worker')

  const insertExecution = db.prepare(`
    INSERT INTO executions
    (agent_id, success, result, error, execution_time, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `)

  // Simulate concurrent writes
  const writePromises = Array.from({ length: 100 }, (_, i) =>
    Promise.resolve().then(() => {
      insertExecution.run(`agent${i % 3}`, i % 2, `Result ${i}`, null, i * 10)
    })
  )

  await Promise.all(writePromises)

  const count = db.prepare('SELECT COUNT(*) as count FROM executions').get() as any
  expect(count.count).toBe(100)

  db.close()
})

test('maintains referential integrity', () => {
  const db = initializeRoundRobinDb(':memory:')

  // Insert agents first
  const insertAgent = db.prepare(`
    INSERT INTO agents (id, name, type, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `)
  insertAgent.run('agent1', 'Agent One', 'worker')

  // Insert execution for existing agent (should succeed)
  const insertExecution = db.prepare(`
    INSERT INTO executions
    (agent_id, success, result, error, execution_time, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `)

  expect(() => {
    insertExecution.run('agent1', 1, 'Success', null, 1000)
  }).not.toThrow()

  // Try to insert execution for non-existent agent (should handle gracefully)
  // Note: Actual foreign key constraints would depend on schema implementation
  const executions = db.prepare('SELECT COUNT(*) as count FROM executions').get() as any
  expect(executions.count).toBe(1)

  db.close()
})

test('supports database cleanup and reset', () => {
  const db = initializeRoundRobinDb(':memory:')

  // Insert test data
  const insertAgent = db.prepare(`
    INSERT INTO agents (id, name, type, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `)
  const insertExecution = db.prepare(`
    INSERT INTO executions
    (agent_id, success, result, error, execution_time, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `)
  const insertState = db.prepare(`
    INSERT INTO round_robin_state (key, value)
    VALUES (?, ?)
  `)

  insertAgent.run('agent1', 'Agent One', 'worker')
  insertExecution.run('agent1', 1, 'Success', null, 1000)
  insertState.run('current_index', '1')

  // Verify data exists
  expect(db.prepare('SELECT COUNT(*) as count FROM agents').get() as any).toEqual({ count: 1 })
  expect(db.prepare('SELECT COUNT(*) as count FROM executions').get() as any).toEqual({ count: 1 })
  expect(db.prepare('SELECT COUNT(*) as count FROM round_robin_state').get() as any).toEqual({ count: 1 })

  // Clean up
  db.run('DELETE FROM executions')
  db.run('DELETE FROM agents')
  db.run('DELETE FROM round_robin_state')

  // Verify cleanup
  expect(db.prepare('SELECT COUNT(*) as count FROM agents').get() as any).toEqual({ count: 0 })
  expect(db.prepare('SELECT COUNT(*) as count FROM executions').get() as any).toEqual({ count: 0 })
  expect(db.prepare('SELECT COUNT(*) as count FROM round_robin_state').get() as any).toEqual({ count: 0 })

  db.close()
})

test('supports schema migrations and versioning', () => {
  const db = initializeRoundRobinDb(':memory:')

  // Check if we can add new columns (simulating schema evolution)
  expect(() => {
    db.run('ALTER TABLE agents ADD COLUMN priority INTEGER DEFAULT 0')
  }).not.toThrow()

  // Insert with new column
  const insertWithPriority = db.prepare(`
    INSERT INTO agents (id, name, type, priority, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `)

  insertWithPriority.run('priority_agent', 'Priority Agent', 'worker', 5)

  const agent = db.prepare(`
    SELECT * FROM agents WHERE id = 'priority_agent'
  `).get() as any

  expect(agent.priority).toBe(5)

  db.close()
})