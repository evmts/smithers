import { describe, test, expect } from 'bun:test'
import type {
  WorkflowPhase,
  PhaseTransition,
  WorkflowDefinition,
  PhaseExecution,
  PhaseOutput,
  WorkflowContext
} from './workflow-types.js'

describe('WorkflowTypes', () => {
  test('should define valid WorkflowPhase interface', () => {
    const phase: WorkflowPhase = {
      id: 'test-phase',
      name: 'Test Phase',
      description: 'A test phase',
      type: 'agent-driven',
      config: {
        model: 'claude-3-sonnet-20241022',
        systemPrompt: 'Test system prompt'
      },
      transitions: [],
      timeout: 30000
    }

    expect(phase.id).toBe('test-phase')
    expect(phase.name).toBe('Test Phase')
    expect(phase.type).toBe('agent-driven')
  })

  test('should define valid PhaseTransition interface', () => {
    const transition: PhaseTransition = {
      id: 'transition-1',
      targetPhase: 'next-phase',
      condition: {
        type: 'output-contains',
        config: { pattern: '<complete>' }
      },
      priority: 100
    }

    expect(transition.targetPhase).toBe('next-phase')
    expect(transition.condition.type).toBe('output-contains')
  })

  test('should define valid WorkflowDefinition interface', () => {
    const workflow: WorkflowDefinition = {
      id: 'test-workflow',
      name: 'Test Workflow',
      version: '1.0.0',
      phases: [],
      initialPhase: 'start',
      context: {}
    }

    expect(workflow.id).toBe('test-workflow')
    expect(workflow.version).toBe('1.0.0')
    expect(workflow.initialPhase).toBe('start')
  })

  test('should define valid PhaseExecution interface', () => {
    const execution: PhaseExecution = {
      id: 'exec-1',
      phaseId: 'phase-1',
      workflowId: 'workflow-1',
      status: 'running',
      startedAt: new Date(),
      input: { test: 'data' },
      context: {}
    }

    expect(execution.phaseId).toBe('phase-1')
    expect(execution.status).toBe('running')
    expect(execution.input).toEqual({ test: 'data' })
  })

  test('should define valid PhaseOutput interface', () => {
    const output: PhaseOutput = {
      structured: {
        decision: 'continue',
        result: 'success'
      },
      raw: 'Task completed successfully',
      metadata: {
        tokensUsed: 150
      }
    }

    expect(output.structured.decision).toBe('continue')
    expect(output.raw).toBe('Task completed successfully')
  })
})