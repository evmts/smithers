import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { DynamicPhase } from './dynamic-phase.js'
import type { WorkflowPhase, WorkflowContext } from '../types/workflow-types.js'

describe('DynamicPhase', () => {
  let phase: DynamicPhase
  let mockContext: WorkflowContext

  beforeEach(() => {
    mockContext = {
      execution_id: 'test-exec',
      variables: {},
      state: {}
    }

    const phaseDefinition: WorkflowPhase = {
      id: 'test-phase',
      name: 'Test Phase',
      description: 'A test phase',
      type: 'agent-driven',
      config: {
        model: 'claude-3-sonnet-20241022',
        systemPrompt: 'Test system prompt',
        outputSchema: {
          type: 'object',
          properties: {
            decision: { type: 'string', enum: ['continue', 'stop'] }
          }
        }
      },
      transitions: [
        {
          id: 'continue-trans',
          targetPhase: 'next-phase',
          condition: {
            type: 'output-contains',
            config: { pattern: 'continue' }
          },
          priority: 100
        }
      ],
      timeout: 30000
    }

    phase = new DynamicPhase(phaseDefinition)
  })

  test('should create phase with definition', () => {
    expect(phase.id).toBe('test-phase')
    expect(phase.name).toBe('Test Phase')
    expect(phase.type).toBe('agent-driven')
  })

  test('should execute phase successfully', async () => {
    const mockExecute = mock(async () => ({
      structured: { decision: 'continue' },
      raw: 'Task completed successfully',
      metadata: {}
    }))

    // Mock the internal execution
    phase['executeAgent'] = mockExecute

    const input = { task: 'analyze code' }
    const result = await phase.execute(input, mockContext)

    expect(result.status).toBe('completed')
    expect(result.output?.structured.decision).toBe('continue')
    expect(mockExecute).toHaveBeenCalledWith(input, mockContext)
  })

  test('should handle execution timeout', async () => {
    // Create phase with very short timeout
    const shortTimeoutPhase = new DynamicPhase({
      ...phase['definition'],
      timeout: 1 // 1ms timeout
    })

    const mockSlowExecute = mock(async () => {
      await new Promise(resolve => setTimeout(resolve, 100)) // 100ms delay
      return { structured: {}, raw: 'done', metadata: {} }
    })

    shortTimeoutPhase['executeAgent'] = mockSlowExecute

    const input = { task: 'slow task' }
    const result = await shortTimeoutPhase.execute(input, mockContext)

    expect(result.status).toBe('timeout')
    expect(result.error).toContain('timeout')
  })

  test('should handle execution errors', async () => {
    const mockFailedExecute = mock(async () => {
      throw new Error('Agent execution failed')
    })

    phase['executeAgent'] = mockFailedExecute

    const input = { task: 'failing task' }
    const result = await phase.execute(input, mockContext)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('Agent execution failed')
  })

  test('should evaluate transition conditions', () => {
    const output = {
      structured: { decision: 'continue', status: 'success' },
      raw: 'The task completed successfully and we should continue',
      metadata: {}
    }

    const validTransitions = phase.evaluateTransitions(output)

    expect(validTransitions).toHaveLength(1)
    expect(validTransitions[0].targetPhase).toBe('next-phase')
  })

  test('should prioritize transitions correctly', () => {
    const phaseWithMultipleTransitions = new DynamicPhase({
      ...phase['definition'],
      transitions: [
        {
          id: 'low-priority',
          targetPhase: 'low-phase',
          condition: { type: 'always', config: {} },
          priority: 50
        },
        {
          id: 'high-priority',
          targetPhase: 'high-phase',
          condition: { type: 'always', config: {} },
          priority: 100
        }
      ]
    })

    const output = {
      structured: {},
      raw: 'test output',
      metadata: {}
    }

    const validTransitions = phaseWithMultipleTransitions.evaluateTransitions(output)

    // Should be sorted by priority (highest first)
    expect(validTransitions[0].priority).toBe(100)
    expect(validTransitions[0].targetPhase).toBe('high-phase')
    expect(validTransitions[1].priority).toBe(50)
    expect(validTransitions[1].targetPhase).toBe('low-phase')
  })

  test('should validate configuration', () => {
    expect(() => {
      new DynamicPhase({
        id: '',
        name: 'Test',
        type: 'agent-driven',
        config: {},
        transitions: []
      })
    }).toThrow('Phase ID cannot be empty')

    expect(() => {
      new DynamicPhase({
        id: 'test',
        name: '',
        type: 'agent-driven',
        config: {},
        transitions: []
      })
    }).toThrow('Phase name cannot be empty')
  })

  test('should handle different transition condition types', () => {
    const phaseWithDifferentConditions = new DynamicPhase({
      ...phase['definition'],
      transitions: [
        {
          id: 'always',
          targetPhase: 'always-phase',
          condition: { type: 'always', config: {} },
          priority: 100
        },
        {
          id: 'never',
          targetPhase: 'never-phase',
          condition: { type: 'never', config: {} },
          priority: 90
        },
        {
          id: 'output-match',
          targetPhase: 'match-phase',
          condition: {
            type: 'structured-field-equals',
            config: { field: 'status', value: 'success' }
          },
          priority: 80
        }
      ]
    })

    const output = {
      structured: { status: 'success' },
      raw: 'test output',
      metadata: {}
    }

    const validTransitions = phaseWithDifferentConditions.evaluateTransitions(output)

    // Should include 'always' and 'structured-field-equals' but not 'never'
    const targetPhases = validTransitions.map(t => t.targetPhase)
    expect(targetPhases).toContain('always-phase')
    expect(targetPhases).toContain('match-phase')
    expect(targetPhases).not.toContain('never-phase')
  })
})