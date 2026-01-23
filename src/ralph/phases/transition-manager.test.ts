import { describe, test, expect } from 'bun:test'
import { DefaultTransitionManager } from './transition-manager.ts'
import type { PhaseDefinition, PhaseExecution, PhaseContext } from './types.ts'

describe('DefaultTransitionManager', () => {
  const mockDefinition: PhaseDefinition = {
    id: 'test-phase',
    name: 'Test Phase',
    version: '1.0',
    steps: [
      { id: 'step1', name: 'Step 1', type: 'action' },
      { id: 'step2', name: 'Step 2', type: 'action' }
    ],
    transitions: [
      {
        from: 'step1',
        to: 'step2',
        condition: { type: 'result', value: 'success' }
      }
    ],
    initialStep: 'step1',
    finalSteps: ['step2'],
    variables: {}
  }

  const mockExecution: PhaseExecution = {
    id: 'exec-1',
    phaseDefinitionId: 'test-phase',
    status: 'running',
    currentStepId: 'step1',
    startedAt: new Date().toISOString(),
    context: {
      variables: {},
      state: {},
      artifacts: {},
      metadata: {}
    },
    stepExecutions: [],
    artifacts: []
  }

  test('evaluates transitions correctly', async () => {
    const manager = new DefaultTransitionManager()
    const stepResult = { result: 'success' }

    const nextStep = await manager.evaluateTransitions(
      mockExecution,
      stepResult,
      mockDefinition
    )

    expect(nextStep).toBe('step2')
  })

  test('returns null when no conditions match', async () => {
    const manager = new DefaultTransitionManager()
    const stepResult = { result: 'failure' }

    const nextStep = await manager.evaluateTransitions(
      mockExecution,
      stepResult,
      mockDefinition
    )

    expect(nextStep).toBeNull()
  })

  test('can check if transition is possible', () => {
    const manager = new DefaultTransitionManager()
    const context: PhaseContext = {
      variables: {},
      state: {},
      artifacts: {},
      metadata: {}
    }

    const canTransition = manager.canTransition(
      'step1',
      'step2',
      context,
      mockDefinition
    )

    expect(canTransition).toBe(true)
  })

  test('returns available transitions from a step', () => {
    const manager = new DefaultTransitionManager()
    const context: PhaseContext = {
      variables: {},
      state: {},
      artifacts: {},
      metadata: {}
    }

    const transitions = manager.getAvailableTransitions(
      'step1',
      context,
      mockDefinition
    )

    expect(transitions).toHaveLength(1)
    expect(transitions[0].to).toBe('step2')
  })
})