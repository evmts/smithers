/**
 * Unit tests for task validation utilities
 * Tests task validation logic and error handling
 */

import { describe, test, expect } from 'bun:test'
import {
  validateTask,
  validateTaskDependencies,
  validateExecutionPlan,
  validateAgentCapabilities,
  TaskValidationError,
  type TaskInput,
  type ExecutionPlan,
  type AgentCapability
} from '../../src/utils/taskValidation'

describe('Task Validation', () => {
  describe('validateTask', () => {
    test('should validate correct task input', () => {
      const validTask: TaskInput = {
        title: 'Implement user authentication',
        description: 'Add login/logout functionality with JWT tokens',
        priority: 'high',
        estimated_hours: 8,
        agents: ['auth-agent', 'security-agent'],
        dependencies: []
      }

      expect(() => validateTask(validTask)).not.toThrow()
    })

    test('should reject task with empty title', () => {
      const invalidTask: TaskInput = {
        title: '',
        description: 'Valid description',
        priority: 'medium',
        estimated_hours: 4
      }

      expect(() => validateTask(invalidTask)).toThrow(TaskValidationError)
      expect(() => validateTask(invalidTask)).toThrow('Task title is required')
    })

    test('should reject task with invalid priority', () => {
      const invalidTask = {
        title: 'Valid title',
        description: 'Valid description',
        priority: 'invalid-priority',
        estimated_hours: 4
      } as TaskInput

      expect(() => validateTask(invalidTask)).toThrow(TaskValidationError)
      expect(() => validateTask(invalidTask)).toThrow('Invalid priority level')
    })

    test('should reject task with negative estimated hours', () => {
      const invalidTask: TaskInput = {
        title: 'Valid title',
        description: 'Valid description',
        priority: 'medium',
        estimated_hours: -2
      }

      expect(() => validateTask(invalidTask)).toThrow(TaskValidationError)
      expect(() => validateTask(invalidTask)).toThrow('Estimated hours must be positive')
    })

    test('should reject task with overly long title', () => {
      const invalidTask: TaskInput = {
        title: 'x'.repeat(201), // > 200 characters
        description: 'Valid description',
        priority: 'medium',
        estimated_hours: 4
      }

      expect(() => validateTask(invalidTask)).toThrow(TaskValidationError)
      expect(() => validateTask(invalidTask)).toThrow('Task title must be 200 characters or less')
    })

    test('should reject task with invalid agent IDs', () => {
      const invalidTask: TaskInput = {
        title: 'Valid title',
        description: 'Valid description',
        priority: 'medium',
        estimated_hours: 4,
        agents: ['', 'valid-agent', null as any]
      }

      expect(() => validateTask(invalidTask)).toThrow(TaskValidationError)
      expect(() => validateTask(invalidTask)).toThrow('Invalid agent ID')
    })

    test('should validate task with optional fields', () => {
      const minimalTask: TaskInput = {
        title: 'Minimal task',
        description: 'Just the basics',
        priority: 'low',
        estimated_hours: 1
      }

      expect(() => validateTask(minimalTask)).not.toThrow()
    })

    test('should validate task complexity levels', () => {
      const complexTask: TaskInput = {
        title: 'Complex system refactor',
        description: 'Refactor entire authentication system',
        priority: 'critical',
        estimated_hours: 40,
        complexity: 'high'
      }

      const simpleTask: TaskInput = {
        title: 'Fix typo',
        description: 'Fix spelling mistake in documentation',
        priority: 'low',
        estimated_hours: 0.5,
        complexity: 'low'
      }

      expect(() => validateTask(complexTask)).not.toThrow()
      expect(() => validateTask(simpleTask)).not.toThrow()
    })
  })

  describe('validateTaskDependencies', () => {
    test('should validate valid dependency chain', () => {
      const tasks = [
        { id: 'task-1', title: 'Task 1', dependencies: [] },
        { id: 'task-2', title: 'Task 2', dependencies: ['task-1'] },
        { id: 'task-3', title: 'Task 3', dependencies: ['task-2'] }
      ]

      expect(() => validateTaskDependencies(tasks)).not.toThrow()
    })

    test('should detect circular dependencies', () => {
      const tasks = [
        { id: 'task-1', title: 'Task 1', dependencies: ['task-3'] },
        { id: 'task-2', title: 'Task 2', dependencies: ['task-1'] },
        { id: 'task-3', title: 'Task 3', dependencies: ['task-2'] }
      ]

      expect(() => validateTaskDependencies(tasks)).toThrow(TaskValidationError)
      expect(() => validateTaskDependencies(tasks)).toThrow('Circular dependency detected')
    })

    test('should detect missing dependency targets', () => {
      const tasks = [
        { id: 'task-1', title: 'Task 1', dependencies: [] },
        { id: 'task-2', title: 'Task 2', dependencies: ['task-1', 'missing-task'] }
      ]

      expect(() => validateTaskDependencies(tasks)).toThrow(TaskValidationError)
      expect(() => validateTaskDependencies(tasks)).toThrow('Dependency target not found: missing-task')
    })

    test('should handle self-referencing dependencies', () => {
      const tasks = [
        { id: 'task-1', title: 'Task 1', dependencies: ['task-1'] }
      ]

      expect(() => validateTaskDependencies(tasks)).toThrow(TaskValidationError)
      expect(() => validateTaskDependencies(tasks)).toThrow('Task cannot depend on itself: task-1')
    })

    test('should validate complex dependency graphs', () => {
      const tasks = [
        { id: 'setup', title: 'Setup', dependencies: [] },
        { id: 'db-schema', title: 'Database Schema', dependencies: ['setup'] },
        { id: 'api-endpoints', title: 'API Endpoints', dependencies: ['db-schema'] },
        { id: 'frontend', title: 'Frontend', dependencies: ['api-endpoints'] },
        { id: 'tests', title: 'Tests', dependencies: ['api-endpoints', 'frontend'] },
        { id: 'deployment', title: 'Deployment', dependencies: ['tests'] }
      ]

      expect(() => validateTaskDependencies(tasks)).not.toThrow()
    })
  })

  describe('validateExecutionPlan', () => {
    test('should validate valid execution plan', () => {
      const plan: ExecutionPlan = {
        id: 'plan-1',
        title: 'Feature Implementation Plan',
        description: 'Complete implementation of new feature',
        phases: [
          {
            id: 'phase-1',
            name: 'Planning',
            tasks: ['task-1', 'task-2'],
            estimated_duration: 4
          },
          {
            id: 'phase-2',
            name: 'Implementation',
            tasks: ['task-3', 'task-4'],
            estimated_duration: 12,
            dependencies: ['phase-1']
          }
        ],
        total_estimated_hours: 16,
        required_agents: ['planner-agent', 'dev-agent', 'test-agent']
      }

      expect(() => validateExecutionPlan(plan)).not.toThrow()
    })

    test('should reject plan without phases', () => {
      const invalidPlan: ExecutionPlan = {
        id: 'plan-1',
        title: 'Empty Plan',
        description: 'Plan with no phases',
        phases: [],
        total_estimated_hours: 0,
        required_agents: []
      }

      expect(() => validateExecutionPlan(invalidPlan)).toThrow(TaskValidationError)
      expect(() => validateExecutionPlan(invalidPlan)).toThrow('Execution plan must contain at least one phase')
    })

    test('should validate phase dependencies', () => {
      const invalidPlan: ExecutionPlan = {
        id: 'plan-1',
        title: 'Invalid Dependencies',
        description: 'Plan with invalid phase dependencies',
        phases: [
          {
            id: 'phase-1',
            name: 'Phase 1',
            tasks: ['task-1'],
            estimated_duration: 4,
            dependencies: ['phase-nonexistent']
          }
        ],
        total_estimated_hours: 4,
        required_agents: ['agent-1']
      }

      expect(() => validateExecutionPlan(invalidPlan)).toThrow(TaskValidationError)
      expect(() => validateExecutionPlan(invalidPlan)).toThrow('Phase dependency not found: phase-nonexistent')
    })

    test('should validate total estimated hours consistency', () => {
      const invalidPlan: ExecutionPlan = {
        id: 'plan-1',
        title: 'Inconsistent Hours',
        description: 'Plan with inconsistent time estimates',
        phases: [
          {
            id: 'phase-1',
            name: 'Phase 1',
            tasks: ['task-1'],
            estimated_duration: 8
          }
        ],
        total_estimated_hours: 4, // Less than phase total
        required_agents: ['agent-1']
      }

      expect(() => validateExecutionPlan(invalidPlan)).toThrow(TaskValidationError)
      expect(() => validateExecutionPlan(invalidPlan)).toThrow('Total estimated hours does not match sum of phases')
    })

    test('should validate agent requirements', () => {
      const invalidPlan: ExecutionPlan = {
        id: 'plan-1',
        title: 'No Agents',
        description: 'Plan without required agents',
        phases: [
          {
            id: 'phase-1',
            name: 'Phase 1',
            tasks: ['task-1'],
            estimated_duration: 4
          }
        ],
        total_estimated_hours: 4,
        required_agents: []
      }

      expect(() => validateExecutionPlan(invalidPlan)).toThrow(TaskValidationError)
      expect(() => validateExecutionPlan(invalidPlan)).toThrow('Execution plan must specify required agents')
    })
  })

  describe('validateAgentCapabilities', () => {
    test('should validate agent capabilities against task requirements', () => {
      const agentCapabilities: AgentCapability[] = [
        {
          agent_id: 'dev-agent',
          capabilities: ['javascript', 'typescript', 'react', 'node.js'],
          max_concurrent_tasks: 3,
          estimated_capacity: 8 // hours per day
        },
        {
          agent_id: 'test-agent',
          capabilities: ['unit-testing', 'integration-testing', 'jest', 'cypress'],
          max_concurrent_tasks: 2,
          estimated_capacity: 6
        }
      ]

      const taskRequirements = ['javascript', 'react', 'unit-testing']

      expect(() => validateAgentCapabilities(agentCapabilities, taskRequirements)).not.toThrow()
    })

    test('should reject when required capabilities are missing', () => {
      const agentCapabilities: AgentCapability[] = [
        {
          agent_id: 'basic-agent',
          capabilities: ['html', 'css'],
          max_concurrent_tasks: 1,
          estimated_capacity: 4
        }
      ]

      const taskRequirements = ['javascript', 'react', 'database']

      expect(() => validateAgentCapabilities(agentCapabilities, taskRequirements)).toThrow(TaskValidationError)
      expect(() => validateAgentCapabilities(agentCapabilities, taskRequirements)).toThrow('Missing required capabilities')
    })

    test('should validate agent capacity constraints', () => {
      const agentCapabilities: AgentCapability[] = [
        {
          agent_id: 'overloaded-agent',
          capabilities: ['javascript', 'react'],
          max_concurrent_tasks: 1,
          estimated_capacity: 2, // Very low capacity
          current_load: 1.8 // Already near capacity
        }
      ]

      const taskRequirements = ['javascript']
      const estimatedWorkload = 6 // 6 hours of work

      expect(() => validateAgentCapabilities(
        agentCapabilities,
        taskRequirements,
        { estimatedWorkload }
      )).toThrow(TaskValidationError)
      expect(() => validateAgentCapabilities(
        agentCapabilities,
        taskRequirements,
        { estimatedWorkload }
      )).toThrow('Insufficient agent capacity')
    })

    test('should handle agent specialization levels', () => {
      const agentCapabilities: AgentCapability[] = [
        {
          agent_id: 'expert-agent',
          capabilities: ['javascript', 'react'],
          specialization_level: {
            'javascript': 'expert',
            'react': 'advanced'
          },
          max_concurrent_tasks: 5,
          estimated_capacity: 10
        },
        {
          agent_id: 'junior-agent',
          capabilities: ['javascript', 'html'],
          specialization_level: {
            'javascript': 'beginner',
            'html': 'intermediate'
          },
          max_concurrent_tasks: 2,
          estimated_capacity: 6
        }
      ]

      const complexTaskRequirements = ['javascript:expert', 'react:advanced']

      expect(() => validateAgentCapabilities(agentCapabilities, complexTaskRequirements)).not.toThrow()

      const simpleTaskRequirements = ['javascript:expert', 'react:expert']

      expect(() => validateAgentCapabilities(agentCapabilities, simpleTaskRequirements)).toThrow(TaskValidationError)
    })
  })

  describe('TaskValidationError', () => {
    test('should create error with message and validation type', () => {
      const error = new TaskValidationError('Test validation error', 'TASK_INVALID')

      expect(error.message).toBe('Test validation error')
      expect(error.validationType).toBe('TASK_INVALID')
      expect(error.name).toBe('TaskValidationError')
    })

    test('should include validation context', () => {
      const context = {
        taskId: 'task-123',
        field: 'title',
        value: ''
      }

      const error = new TaskValidationError('Title is required', 'FIELD_REQUIRED', context)

      expect(error.context).toEqual(context)
      expect(error.validationType).toBe('FIELD_REQUIRED')
    })
  })

  describe('Edge cases and integration', () => {
    test('should validate large scale task plans', () => {
      // Generate a large plan with many tasks and dependencies
      const largePlan: ExecutionPlan = {
        id: 'large-plan',
        title: 'Large Scale Project',
        description: 'Complex project with many phases',
        phases: Array.from({ length: 10 }, (_, i) => ({
          id: `phase-${i + 1}`,
          name: `Phase ${i + 1}`,
          tasks: Array.from({ length: 5 }, (_, j) => `task-${i + 1}-${j + 1}`),
          estimated_duration: 8,
          dependencies: i > 0 ? [`phase-${i}`] : []
        })),
        total_estimated_hours: 80,
        required_agents: ['agent-1', 'agent-2', 'agent-3']
      }

      expect(() => validateExecutionPlan(largePlan)).not.toThrow()
    })

    test('should validate task plan with conditional execution', () => {
      const conditionalPlan: ExecutionPlan = {
        id: 'conditional-plan',
        title: 'Conditional Execution Plan',
        description: 'Plan with conditional task execution',
        phases: [
          {
            id: 'phase-1',
            name: 'Setup',
            tasks: ['setup-task'],
            estimated_duration: 2
          },
          {
            id: 'phase-2',
            name: 'Development',
            tasks: ['dev-task-1', 'dev-task-2'],
            estimated_duration: 8,
            dependencies: ['phase-1'],
            condition: 'setup_successful'
          },
          {
            id: 'phase-3',
            name: 'Cleanup',
            tasks: ['cleanup-task'],
            estimated_duration: 1,
            dependencies: ['phase-1'], // Can run even if phase-2 is skipped
            condition: 'always'
          }
        ],
        total_estimated_hours: 11,
        required_agents: ['setup-agent', 'dev-agent']
      }

      expect(() => validateExecutionPlan(conditionalPlan)).not.toThrow()
    })
  })
})