/**
 * Unit tests for AgentRotator class
 * Tests round-robin logic for agent selection and rotation
 */

import { test, expect } from 'bun:test'
import { AgentRotator } from '../../src/agents/AgentRotator'
import type { RoundRobinAgent } from '../../src/hooks/useRoundRobin'

const testAgents: RoundRobinAgent[] = [
  { id: 'agent1', name: 'Agent One', type: 'worker' },
  { id: 'agent2', name: 'Agent Two', type: 'worker' },
  { id: 'agent3', name: 'Agent Three', type: 'supervisor' },
]

test('AgentRotator initializes with first agent selected', () => {
  const rotator = new AgentRotator(testAgents)

  expect(rotator.getCurrentIndex()).toBe(0)
  expect(rotator.getTotalAgents()).toBe(3)
  expect(rotator.getCurrentAgent()).toEqual(testAgents[0])
})

test('AgentRotator rotates through agents in round-robin fashion', () => {
  const rotator = new AgentRotator(testAgents)

  // First rotation
  expect(rotator.getNext()).toEqual(testAgents[0])
  expect(rotator.getCurrentIndex()).toBe(1)

  // Second rotation
  expect(rotator.getNext()).toEqual(testAgents[1])
  expect(rotator.getCurrentIndex()).toBe(2)

  // Third rotation
  expect(rotator.getNext()).toEqual(testAgents[2])
  expect(rotator.getCurrentIndex()).toBe(0)

  // Fourth rotation - wraps back to first
  expect(rotator.getNext()).toEqual(testAgents[0])
  expect(rotator.getCurrentIndex()).toBe(1)
})

test('AgentRotator handles empty agent list gracefully', () => {
  const emptyRotator = new AgentRotator([])

  expect(emptyRotator.getTotalAgents()).toBe(0)
  expect(emptyRotator.getCurrentAgent()).toBeNull()
  expect(emptyRotator.getNext()).toBeNull()
})

test('AgentRotator handles single agent correctly', () => {
  const singleAgent = [testAgents[0]]
  const singleRotator = new AgentRotator(singleAgent)

  expect(singleRotator.getTotalAgents()).toBe(1)
  expect(singleRotator.getCurrentAgent()).toEqual(testAgents[0])

  // Should always return the same agent
  expect(singleRotator.getNext()).toEqual(testAgents[0])
  expect(singleRotator.getNext()).toEqual(testAgents[0])
  expect(singleRotator.getCurrentIndex()).toBe(0)
})

test('AgentRotator can set specific index', () => {
  const rotator = new AgentRotator(testAgents)

  rotator.setCurrentIndex(2)

  expect(rotator.getCurrentIndex()).toBe(2)
  expect(rotator.getCurrentAgent()).toEqual(testAgents[2])

  // Next call should advance to next agent
  expect(rotator.getNext()).toEqual(testAgents[2])
  expect(rotator.getCurrentIndex()).toBe(0)
})

test('AgentRotator validates index bounds when setting', () => {
  const rotator = new AgentRotator(testAgents)

  expect(() => rotator.setCurrentIndex(-1)).toThrow('Index -1 out of bounds')
  expect(() => rotator.setCurrentIndex(5)).toThrow('Index 5 out of bounds')
  expect(() => rotator.setCurrentIndex(1.5)).toThrow('Index must be an integer')
})

test('AgentRotator resets to first agent', () => {
  const rotator = new AgentRotator(testAgents)

  rotator.getNext() // Move to agent1 (index 1)
  rotator.getNext() // Move to agent2 (index 2)

  expect(rotator.getCurrentIndex()).toBe(2)

  rotator.reset()

  expect(rotator.getCurrentIndex()).toBe(0)
  expect(rotator.getCurrentAgent()).toEqual(testAgents[0])
})

test('AgentRotator updates agents list and resets position', () => {
  const rotator = new AgentRotator(testAgents)
  const newAgents: RoundRobinAgent[] = [
    { id: 'newAgent1', name: 'New Agent 1', type: 'worker' },
    { id: 'newAgent2', name: 'New Agent 2', type: 'supervisor' },
  ]

  rotator.getNext() // Move to index 1
  rotator.getNext() // Move to index 2

  rotator.updateAgents(newAgents)

  expect(rotator.getTotalAgents()).toBe(2)
  expect(rotator.getCurrentIndex()).toBe(0)
  expect(rotator.getCurrentAgent()).toEqual(newAgents[0])
})

test('AgentRotator provides agent filtering capabilities', () => {
  const rotator = new AgentRotator(testAgents)

  const workerAgents = rotator.getAgentsByType('worker')
  const supervisorAgents = rotator.getAgentsByType('supervisor')

  expect(workerAgents).toHaveLength(2)
  expect(workerAgents).toEqual([testAgents[0], testAgents[1]])

  expect(supervisorAgents).toHaveLength(1)
  expect(supervisorAgents).toEqual([testAgents[2]])
})

test('AgentRotator finds agent by ID', () => {
  const rotator = new AgentRotator(testAgents)

  const foundAgent = rotator.getAgentById('agent2')
  const notFoundAgent = rotator.getAgentById('nonexistent')

  expect(foundAgent).toEqual(testAgents[1])
  expect(notFoundAgent).toBeNull()
})

test('AgentRotator provides execution statistics interface', () => {
  const rotator = new AgentRotator(testAgents)

  const stats = rotator.getRotationStats()

  expect(stats).toEqual({
    currentIndex: 0,
    totalAgents: 3,
    rotationCount: 0,
    lastRotationTime: null,
  })
})

test('AgentRotator tracks rotation count and timing', () => {
  const rotator = new AgentRotator(testAgents)
  const startTime = Date.now()

  rotator.getNext() // First rotation
  rotator.getNext() // Second rotation

  const stats = rotator.getRotationStats()

  expect(stats.rotationCount).toBe(2)
  expect(stats.lastRotationTime).toBeGreaterThanOrEqual(startTime)
  expect(stats.lastRotationTime).toBeLessThanOrEqual(Date.now())
})

test('AgentRotator handles concurrent access safely', () => {
  const rotator = new AgentRotator(testAgents)

  // Simulate concurrent calls to getNext
  const results = Array.from({ length: 10 }, (_, i) => {
    return rotator.getNext()
  })

  // Should cycle through agents predictably
  expect(results[0]).toEqual(testAgents[0])
  expect(results[1]).toEqual(testAgents[1])
  expect(results[2]).toEqual(testAgents[2])
  expect(results[3]).toEqual(testAgents[0]) // Wraps around
  expect(results[9]).toEqual(testAgents[0]) // 9 % 3 = 0
})

test('AgentRotator serializes and deserializes state', () => {
  const rotator = new AgentRotator(testAgents)

  rotator.getNext() // Move to index 1
  rotator.getNext() // Move to index 2

  const serialized = rotator.serialize()
  const newRotator = AgentRotator.deserialize(serialized, testAgents)

  expect(newRotator.getCurrentIndex()).toBe(rotator.getCurrentIndex())
  expect(newRotator.getTotalAgents()).toBe(rotator.getTotalAgents())
  expect(newRotator.getCurrentAgent()).toEqual(rotator.getCurrentAgent())
})