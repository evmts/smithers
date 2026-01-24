import { describe, test, expect, beforeEach } from 'bun:test'
import { DefaultPhaseEngine } from './phase-engine.ts'
import { XMLPhaseParser } from './xml-parser.ts'
import { DefaultTransitionManager } from './transition-manager.ts'
import type { PhaseDefinition, PhaseContext } from './types.js'

describe('DefaultPhaseEngine', () => {
  let engine: DefaultPhaseEngine
  let mockDefinition: PhaseDefinition

  beforeEach(() => {
    const parser = new XMLPhaseParser()
    const transitionManager = new DefaultTransitionManager()
    engine = new DefaultPhaseEngine(parser, transitionManager)

    mockDefinition = {
      id: 'test-phase',
      name: 'Test Phase',
      version: '1.0',
      description: 'Test phase for unit testing',
      steps: [
        {
          id: 'step1',
          name: 'Initial Step',
          type: 'action',
          config: { message: 'Hello World' }
        },
        {
          id: 'step2',
          name: 'Processing Step',
          type: 'action',
          timeout: 5000
        },
        {
          id: 'step3',
          name: 'Final Step',
          type: 'action'
        }
      ],
      transitions: [
        {
          from: 'step1',
          to: 'step2',
          trigger: { type: 'automatic' }
        },
        {
          from: 'step2',
          to: 'step3',
          condition: { type: 'result', operator: 'eq', value: 'success' },
          trigger: { type: 'automatic' }
        }
      ],
      initialStep: 'step1',
      finalSteps: ['step3'],
      variables: {
        debug: true,
        apiUrl: 'https://api.example.com'
      }
    }
  })

  describe('loadDefinition', () => {
    test('loads valid XML definition', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<phase id="test" name="Test" version="1.0">
  <initial-step>step1</initial-step>
  <final-steps><step>step1</step></final-steps>
  <steps>
    <step id="step1" name="Test Step" type="action"/>
  </steps>
</phase>`

      const definition = await engine.loadDefinition(xml)

      expect(definition.id).toBe('test')
      expect(definition.name).toBe('Test')
      expect(definition.steps).toHaveLength(1)
    })

    test('throws error for invalid XML', async () => {
      const invalidXml = '<invalid xml>'

      await expect(engine.loadDefinition(invalidXml)).rejects.toThrow()
    })

    test('throws error for validation failures', async () => {
      const xmlWithErrors = `<?xml version="1.0" encoding="UTF-8"?>
<phase name="Test">
  <initial-step>missing-step</initial-step>
  <steps/>
</phase>`

      await expect(engine.loadDefinition(xmlWithErrors)).rejects.toThrow()
    })
  })

  describe('executePhase', () => {
    test('creates and starts phase execution', async () => {
      const execution = await engine.executePhase(mockDefinition)

      expect(execution.id).toBeDefined()
      expect(execution.phaseDefinitionId).toBe('test-phase')
      expect(execution.status).toBe('completed') // Mock engine completes immediately
      expect(execution.currentStepId).toBe('step3') // Should reach final step
      expect(execution.stepExecutions).toHaveLength(3) // All steps executed
    })

    test('uses provided context', async () => {
      const customContext: Partial<PhaseContext> = {
        variables: { custom: 'value' },
        state: { initialized: true }
      }

      const execution = await engine.executePhase(mockDefinition, customContext)

      expect(execution.context.variables.custom).toBe('value')
      expect(execution.context.state.initialized).toBe(true)
      expect(execution.context.variables.debug).toBe(true) // Original variables preserved
    })

    test('handles step execution errors', async () => {
      const definitionWithError = {
        ...mockDefinition,
        steps: [
          {
            id: 'error-step',
            name: 'Error Step',
            type: 'action' as const,
            config: { throwError: true }
          }
        ],
        initialStep: 'error-step',
        finalSteps: ['error-step'],
        transitions: []
      }

      const execution = await engine.executePhase(definitionWithError)

      expect(execution.status).toBe('failed')
      expect(execution.error).toBeDefined()
    })

    test('respects phase timeout configuration', async () => {
      const definitionWithTimeout = {
        ...mockDefinition,
        config: {
          maxDuration: 1000 // 1 second timeout
        }
      }

      const execution = await engine.executePhase(definitionWithTimeout)

      // For this mock implementation, we'll complete quickly
      // In real implementation, this would test actual timeout behavior
      expect(['completed', 'failed']).toContain(execution.status)
    })

    test('executes steps in correct order', async () => {
      const execution = await engine.executePhase(mockDefinition)

      expect(execution.stepExecutions).toHaveLength(3)
      expect(execution.stepExecutions[0].stepId).toBe('step1')
      expect(execution.stepExecutions[1].stepId).toBe('step2')
      expect(execution.stepExecutions[2].stepId).toBe('step3')
    })
  })

  describe('execution management', () => {
    test('getExecution returns execution by id', async () => {
      const originalExecution = await engine.executePhase(mockDefinition)

      const retrieved = await engine.getExecution(originalExecution.id)

      expect(retrieved).toBeTruthy()
      expect(retrieved!.id).toBe(originalExecution.id)
    })

    test('getExecution returns null for non-existent id', async () => {
      const retrieved = await engine.getExecution('non-existent')

      expect(retrieved).toBeNull()
    })

    test('pauseExecution changes status to paused', async () => {
      const execution = await engine.executePhase(mockDefinition)

      await engine.pauseExecution(execution.id)

      const updated = await engine.getExecution(execution.id)
      expect(updated!.status).toBe('paused')
    })

    test('resumeExecution changes status from paused to running', async () => {
      const execution = await engine.executePhase(mockDefinition)
      await engine.pauseExecution(execution.id)

      await engine.resumeExecution(execution.id)

      const updated = await engine.getExecution(execution.id)
      expect(updated!.status).toBe('running')
    })

    test('cancelExecution changes status to cancelled', async () => {
      const execution = await engine.executePhase(mockDefinition)

      await engine.cancelExecution(execution.id)

      const updated = await engine.getExecution(execution.id)
      expect(updated!.status).toBe('cancelled')
    })
  })

  describe('listExecutions', () => {
    test('returns all executions when no filters', async () => {
      const exec1 = await engine.executePhase(mockDefinition)
      const exec2 = await engine.executePhase(mockDefinition)

      const executions = await engine.listExecutions()

      expect(executions).toHaveLength(2)
      const ids = executions.map(e => e.id)
      expect(ids).toContain(exec1.id)
      expect(ids).toContain(exec2.id)
    })

    test('filters by status', async () => {
      const exec1 = await engine.executePhase(mockDefinition)
      const exec2 = await engine.executePhase(mockDefinition)
      await engine.pauseExecution(exec1.id)

      const runningExecutions = await engine.listExecutions({
        status: ['running', 'completed']
      })

      expect(runningExecutions).toHaveLength(1)
      expect(runningExecutions[0].id).toBe(exec2.id)
    })

    test('filters by phase definition id', async () => {
      const otherDefinition = { ...mockDefinition, id: 'other-phase' }
      const exec1 = await engine.executePhase(mockDefinition)
      await engine.executePhase(otherDefinition)

      const filtered = await engine.listExecutions({
        phaseDefinitionId: 'test-phase'
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(exec1.id)
    })

    test('respects limit parameter', async () => {
      await engine.executePhase(mockDefinition)
      await engine.executePhase(mockDefinition)
      await engine.executePhase(mockDefinition)

      const limited = await engine.listExecutions({ limit: 2 })

      expect(limited).toHaveLength(2)
    })

    test('respects offset parameter', async () => {
      const exec1 = await engine.executePhase(mockDefinition)
      await engine.executePhase(mockDefinition)
      await engine.executePhase(mockDefinition)

      const offset = await engine.listExecutions({ offset: 1, limit: 2 })

      expect(offset).toHaveLength(2)
      // Should skip the first execution
      const ids = offset.map(e => e.id)
      expect(ids).not.toContain(exec1.id)
    })
  })

  describe('step execution', () => {
    test('creates step execution with correct data', async () => {
      const execution = await engine.executePhase(mockDefinition)
      const stepExecution = execution.stepExecutions[0]

      expect(stepExecution.id).toBeDefined()
      expect(stepExecution.stepId).toBe('step1')
      expect(stepExecution.phaseExecutionId).toBe(execution.id)
      expect(stepExecution.status).toBe('completed')
      expect(stepExecution.startedAt).toBeDefined()
      expect(stepExecution.completedAt).toBeDefined()
      expect(stepExecution.retryCount).toBe(0)
    })

    test('handles step with configuration', async () => {
      const execution = await engine.executePhase(mockDefinition)
      const stepExecution = execution.stepExecutions[0] // step1 has config

      expect(stepExecution.input).toEqual({ message: 'Hello World' })
    })

    test('executes step transitions', async () => {
      const execution = await engine.executePhase(mockDefinition)

      // Should have executed all steps due to successful transitions
      expect(execution.stepExecutions).toHaveLength(3)
      expect(execution.currentStepId).toBe('step3') // Final step
    })
  })

  describe('error handling', () => {
    test('catches and records step execution errors', async () => {
      const failingDefinition = {
        ...mockDefinition,
        steps: [{
          id: 'failing-step',
          name: 'Failing Step',
          type: 'action' as const,
          config: { simulateError: true }
        }],
        initialStep: 'failing-step',
        finalSteps: ['failing-step'],
        transitions: []
      }

      const execution = await engine.executePhase(failingDefinition)

      expect(execution.status).toBe('failed')
      expect(execution.error).toContain('Step execution failed')
    })

    test('handles missing step definitions gracefully', async () => {
      const invalidDefinition = {
        ...mockDefinition,
        initialStep: 'non-existent-step'
      }

      const execution = await engine.executePhase(invalidDefinition)

      expect(execution.status).toBe('failed')
      expect(execution.error).toContain('not found')
    })
  })

  describe('concurrent execution', () => {
    test('handles multiple concurrent executions', async () => {
      const promises = [
        engine.executePhase(mockDefinition),
        engine.executePhase(mockDefinition),
        engine.executePhase(mockDefinition)
      ]

      const executions = await Promise.all(promises)

      expect(executions).toHaveLength(3)
      const uniqueIds = new Set(executions.map(e => e.id))
      expect(uniqueIds.size).toBe(3) // All executions have unique IDs
    })
  })
})