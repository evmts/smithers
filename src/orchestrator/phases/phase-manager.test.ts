import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { PhaseManager } from './phase-manager.js'
import type { WorkflowDefinition, WorkflowContext } from '../types/workflow-types.js'

describe('PhaseManager', () => {
  let manager: PhaseManager
  let mockWorkflow: WorkflowDefinition
  let mockContext: WorkflowContext

  beforeEach(() => {
    mockContext = {
      execution_id: 'test-exec',
      variables: {},
      state: {}
    }

    mockWorkflow = {
      id: 'test-workflow',
      name: 'Test Workflow',
      version: '1.0.0',
      initialPhase: 'start',
      context: {},
      phases: [
        {
          id: 'start',
          name: 'Start Phase',
          type: 'agent-driven',
          config: { model: 'claude-3-sonnet-20241022' },
          transitions: [
            {
              id: 'to-process',
              targetPhase: 'process',
              condition: { type: 'always', config: {} },
              priority: 100
            }
          ]
        },
        {
          id: 'process',
          name: 'Process Phase',
          type: 'agent-driven',
          config: { model: 'claude-3-sonnet-20241022' },
          transitions: [
            {
              id: 'to-end',
              targetPhase: 'end',
              condition: { type: 'always', config: {} },
              priority: 100
            }
          ]
        },
        {
          id: 'end',
          name: 'End Phase',
          type: 'manual',
          config: {},
          transitions: []
        }
      ]
    }

    manager = new PhaseManager()
  })

  test('should initialize with workflow definition', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    expect(manager.getCurrentPhase()).toBe('start')
    expect(manager.getWorkflowId()).toBe('test-workflow')
  })

  test('should execute current phase', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    // Mock the phase execution
    const mockExecute = mock(async () => ({
      id: 'exec-1',
      phaseId: 'start',
      workflowId: 'test-workflow',
      status: 'completed' as const,
      startedAt: new Date(),
      completedAt: new Date(),
      input: {},
      context: mockContext,
      output: {
        structured: { next: 'process' },
        raw: 'Start phase completed',
        metadata: {}
      }
    }))

    const startPhase = manager['phases'].get('start')!
    startPhase.execute = mockExecute

    const result = await manager.executeCurrentPhase({})

    expect(result.status).toBe('completed')
    expect(result.output?.structured.next).toBe('process')
    expect(mockExecute).toHaveBeenCalled()
  })

  test('should transition to next phase automatically', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    // Mock successful execution that triggers transition
    const mockExecute = mock(async () => ({
      id: 'exec-1',
      phaseId: 'start',
      workflowId: 'test-workflow',
      status: 'completed' as const,
      startedAt: new Date(),
      completedAt: new Date(),
      input: {},
      context: mockContext,
      output: {
        structured: {},
        raw: 'completed',
        metadata: {}
      }
    }))

    const startPhase = manager['phases'].get('start')!
    startPhase.execute = mockExecute

    await manager.executeCurrentPhase({})

    // Should automatically transition to next phase
    expect(manager.getCurrentPhase()).toBe('process')
  })

  test('should handle phase execution failure', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    const mockFailedExecute = mock(async () => ({
      id: 'exec-1',
      phaseId: 'start',
      workflowId: 'test-workflow',
      status: 'failed' as const,
      startedAt: new Date(),
      input: {},
      context: mockContext,
      error: 'Phase execution failed'
    }))

    const startPhase = manager['phases'].get('start')!
    startPhase.execute = mockFailedExecute

    const result = await manager.executeCurrentPhase({})

    expect(result.status).toBe('failed')
    expect(result.error).toContain('Phase execution failed')
    expect(manager.getCurrentPhase()).toBe('start') // Should stay on failed phase
  })

  test('should provide workflow status', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    const status = manager.getWorkflowStatus()

    expect(status.workflowId).toBe('test-workflow')
    expect(status.currentPhase).toBe('start')
    expect(status.status).toBe('running')
    expect(status.phases).toHaveLength(3)
  })

  test('should handle manual phase transitions', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    const success = await manager.transitionTo('process')

    expect(success).toBe(true)
    expect(manager.getCurrentPhase()).toBe('process')
  })

  test('should reject invalid phase transitions', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    const success = await manager.transitionTo('nonexistent-phase')

    expect(success).toBe(false)
    expect(manager.getCurrentPhase()).toBe('start') // Should stay on current phase
  })

  test('should track execution history', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    // Execute multiple phases
    const mockExecute = mock(async () => ({
      id: 'exec-1',
      phaseId: 'start',
      workflowId: 'test-workflow',
      status: 'completed' as const,
      startedAt: new Date(),
      completedAt: new Date(),
      input: {},
      context: mockContext,
      output: {
        structured: {},
        raw: 'completed',
        metadata: {}
      }
    }))

    const startPhase = manager['phases'].get('start')!
    startPhase.execute = mockExecute

    await manager.executeCurrentPhase({})

    const history = manager.getExecutionHistory()
    expect(history).toHaveLength(1)
    expect(history[0].phaseId).toBe('start')
    expect(history[0].status).toBe('completed')
  })

  test('should complete workflow when reaching terminal phase', async () => {
    await manager.initialize(mockWorkflow, mockContext)

    // Transition directly to end phase
    await manager.transitionTo('end')

    const status = manager.getWorkflowStatus()
    expect(status.status).toBe('completed')
    expect(status.currentPhase).toBe('end')
  })

  test('should handle cyclic phase transitions', async () => {
    const cyclicWorkflow: WorkflowDefinition = {
      ...mockWorkflow,
      phases: [
        {
          id: 'loop-start',
          name: 'Loop Start',
          type: 'agent-driven',
          config: {},
          transitions: [
            {
              id: 'continue-loop',
              targetPhase: 'loop-end',
              condition: { type: 'always', config: {} },
              priority: 100
            }
          ]
        },
        {
          id: 'loop-end',
          name: 'Loop End',
          type: 'agent-driven',
          config: {},
          transitions: [
            {
              id: 'back-to-start',
              targetPhase: 'loop-start',
              condition: { type: 'output-contains', config: { pattern: 'continue' } },
              priority: 100
            }
          ]
        }
      ],
      initialPhase: 'loop-start'
    }

    const cyclicManager = new PhaseManager()
    await cyclicManager.initialize(cyclicWorkflow, mockContext)

    // Should handle cyclic transitions without infinite loops
    expect(cyclicManager.getCurrentPhase()).toBe('loop-start')

    const success = await cyclicManager.transitionTo('loop-end')
    expect(success).toBe(true)
    expect(cyclicManager.getCurrentPhase()).toBe('loop-end')
  })
})