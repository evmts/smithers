/**
 * Task validation utilities
 * Provides comprehensive validation for tasks, dependencies, execution plans, and agent capabilities
 */

import type { TaskInput, ExecutionPlan } from '../hooks/useTasks'

/**
 * Custom error class for task validation errors
 */
export class TaskValidationError extends Error {
  public readonly validationType: string
  public readonly context?: Record<string, any>

  constructor(message: string, validationType: string, context?: Record<string, any>) {
    super(message)
    this.name = 'TaskValidationError'
    this.validationType = validationType
    this.context = context
  }
}

/**
 * Agent capability interface
 */
export interface AgentCapability {
  agent_id: string
  capabilities: string[]
  specialization_level?: Record<string, 'beginner' | 'intermediate' | 'advanced' | 'expert'>
  max_concurrent_tasks: number
  estimated_capacity: number // hours per day
  current_load?: number
}

/**
 * Task for dependency validation
 */
export interface TaskForValidation {
  id: string
  title: string
  dependencies?: string[]
}

/**
 * Validation options for agent capabilities
 */
export interface AgentValidationOptions {
  estimatedWorkload?: number
  requirementLevel?: 'any' | 'exact' | 'minimum'
}

/**
 * Validates a task input for creation or updates
 */
export function validateTask(task: TaskInput): void {
  // Title validation
  if (!task.title || typeof task.title !== 'string') {
    throw new TaskValidationError('Task title is required', 'FIELD_REQUIRED', {
      field: 'title',
      value: task.title
    })
  }

  if (task.title.trim().length === 0) {
    throw new TaskValidationError('Task title cannot be empty', 'FIELD_EMPTY', {
      field: 'title',
      value: task.title
    })
  }

  if (task.title.length > 200) {
    throw new TaskValidationError('Task title must be 200 characters or less', 'FIELD_TOO_LONG', {
      field: 'title',
      maxLength: 200,
      actualLength: task.title.length
    })
  }

  // Priority validation
  const validPriorities = ['low', 'medium', 'high', 'critical']
  if (!validPriorities.includes(task.priority)) {
    throw new TaskValidationError('Invalid priority level', 'INVALID_PRIORITY', {
      field: 'priority',
      value: task.priority,
      validValues: validPriorities
    })
  }

  // Estimated hours validation
  if (typeof task.estimated_hours !== 'number') {
    throw new TaskValidationError('Estimated hours must be a number', 'INVALID_TYPE', {
      field: 'estimated_hours',
      value: task.estimated_hours,
      expectedType: 'number'
    })
  }

  if (task.estimated_hours <= 0) {
    throw new TaskValidationError('Estimated hours must be positive', 'INVALID_VALUE', {
      field: 'estimated_hours',
      value: task.estimated_hours,
      constraint: 'positive'
    })
  }

  if (task.estimated_hours > 1000) {
    throw new TaskValidationError('Estimated hours cannot exceed 1000', 'FIELD_TOO_LARGE', {
      field: 'estimated_hours',
      value: task.estimated_hours,
      maxValue: 1000
    })
  }

  // Description validation (optional)
  if (task.description !== undefined) {
    if (typeof task.description !== 'string') {
      throw new TaskValidationError('Task description must be a string', 'INVALID_TYPE', {
        field: 'description',
        value: task.description,
        expectedType: 'string'
      })
    }

    if (task.description.length > 2000) {
      throw new TaskValidationError('Task description must be 2000 characters or less', 'FIELD_TOO_LONG', {
        field: 'description',
        maxLength: 2000,
        actualLength: task.description.length
      })
    }
  }

  // Complexity validation (optional)
  if (task.complexity !== undefined) {
    const validComplexities = ['low', 'medium', 'high']
    if (!validComplexities.includes(task.complexity)) {
      throw new TaskValidationError('Invalid complexity level', 'INVALID_COMPLEXITY', {
        field: 'complexity',
        value: task.complexity,
        validValues: validComplexities
      })
    }
  }

  // Agent IDs validation (optional)
  if (task.agents !== undefined) {
    if (!Array.isArray(task.agents)) {
      throw new TaskValidationError('Agents must be an array', 'INVALID_TYPE', {
        field: 'agents',
        value: task.agents,
        expectedType: 'array'
      })
    }

    for (let i = 0; i < task.agents.length; i++) {
      const agentId = task.agents[i]
      if (!agentId || typeof agentId !== 'string' || agentId.trim().length === 0) {
        throw new TaskValidationError('Invalid agent ID', 'INVALID_AGENT_ID', {
          field: 'agents',
          index: i,
          value: agentId
        })
      }
    }
  }

  // Dependencies validation (optional)
  if (task.dependencies !== undefined) {
    if (!Array.isArray(task.dependencies)) {
      throw new TaskValidationError('Dependencies must be an array', 'INVALID_TYPE', {
        field: 'dependencies',
        value: task.dependencies,
        expectedType: 'array'
      })
    }

    for (let i = 0; i < task.dependencies.length; i++) {
      const depId = task.dependencies[i]
      if (!depId || typeof depId !== 'string' || depId.trim().length === 0) {
        throw new TaskValidationError('Invalid dependency ID', 'INVALID_DEPENDENCY_ID', {
          field: 'dependencies',
          index: i,
          value: depId
        })
      }
    }
  }

  // Required capabilities validation (optional)
  if (task.requiredCapabilities !== undefined) {
    if (!Array.isArray(task.requiredCapabilities)) {
      throw new TaskValidationError('Required capabilities must be an array', 'INVALID_TYPE', {
        field: 'requiredCapabilities',
        value: task.requiredCapabilities,
        expectedType: 'array'
      })
    }

    for (let i = 0; i < task.requiredCapabilities.length; i++) {
      const capability = task.requiredCapabilities[i]
      if (!capability || typeof capability !== 'string' || capability.trim().length === 0) {
        throw new TaskValidationError('Invalid capability', 'INVALID_CAPABILITY', {
          field: 'requiredCapabilities',
          index: i,
          value: capability
        })
      }
    }
  }
}

/**
 * Validates task dependencies for circular references and missing targets
 */
export function validateTaskDependencies(tasks: TaskForValidation[]): void {
  const taskIds = new Set(tasks.map(task => task.id))
  const dependencyGraph = new Map<string, string[]>()

  // Build dependency graph and validate targets
  for (const task of tasks) {
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        // Check for self-reference
        if (depId === task.id) {
          throw new TaskValidationError(
            `Task cannot depend on itself: ${task.id}`,
            'SELF_DEPENDENCY',
            { taskId: task.id, dependencyId: depId }
          )
        }

        // Check if dependency target exists
        if (!taskIds.has(depId)) {
          throw new TaskValidationError(
            `Dependency target not found: ${depId}`,
            'MISSING_DEPENDENCY_TARGET',
            { taskId: task.id, dependencyId: depId }
          )
        }
      }

      dependencyGraph.set(task.id, task.dependencies)
    } else {
      dependencyGraph.set(task.id, [])
    }
  }

  // Check for circular dependencies using DFS
  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  const hasCycle = (taskId: string): boolean => {
    visited.add(taskId)
    recursionStack.add(taskId)

    const dependencies = dependencyGraph.get(taskId) || []
    for (const depId of dependencies) {
      if (!visited.has(depId)) {
        if (hasCycle(depId)) {
          return true
        }
      } else if (recursionStack.has(depId)) {
        return true
      }
    }

    recursionStack.delete(taskId)
    return false
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      if (hasCycle(task.id)) {
        throw new TaskValidationError(
          'Circular dependency detected',
          'CIRCULAR_DEPENDENCY',
          { taskId: task.id }
        )
      }
    }
  }
}

/**
 * Validates an execution plan structure and consistency
 */
export function validateExecutionPlan(plan: ExecutionPlan): void {
  // Basic structure validation
  if (!plan.id || typeof plan.id !== 'string') {
    throw new TaskValidationError('Execution plan must have a valid ID', 'MISSING_PLAN_ID')
  }

  if (!plan.title || typeof plan.title !== 'string') {
    throw new TaskValidationError('Execution plan must have a title', 'MISSING_PLAN_TITLE')
  }

  if (!plan.phases || !Array.isArray(plan.phases)) {
    throw new TaskValidationError('Execution plan must have phases array', 'MISSING_PHASES')
  }

  if (plan.phases.length === 0) {
    throw new TaskValidationError('Execution plan must contain at least one phase', 'NO_PHASES')
  }

  if (typeof plan.total_estimated_hours !== 'number' || plan.total_estimated_hours < 0) {
    throw new TaskValidationError('Invalid total estimated hours', 'INVALID_TOTAL_HOURS', {
      value: plan.total_estimated_hours
    })
  }

  if (!Array.isArray(plan.required_agents)) {
    throw new TaskValidationError('Required agents must be an array', 'INVALID_REQUIRED_AGENTS')
  }

  if (plan.required_agents.length === 0) {
    throw new TaskValidationError('Execution plan must specify required agents', 'NO_REQUIRED_AGENTS')
  }

  // Phase validation
  const phaseIds = new Set<string>()
  let totalPhaseHours = 0

  for (let i = 0; i < plan.phases.length; i++) {
    const phase = plan.phases[i]

    // Phase ID validation
    if (!phase.id || typeof phase.id !== 'string') {
      throw new TaskValidationError(`Phase ${i} must have a valid ID`, 'INVALID_PHASE_ID', {
        phaseIndex: i,
        phase
      })
    }

    if (phaseIds.has(phase.id)) {
      throw new TaskValidationError(`Duplicate phase ID: ${phase.id}`, 'DUPLICATE_PHASE_ID', {
        phaseId: phase.id
      })
    }
    phaseIds.add(phase.id)

    // Phase name validation
    if (!phase.name || typeof phase.name !== 'string') {
      throw new TaskValidationError(`Phase ${phase.id} must have a name`, 'MISSING_PHASE_NAME', {
        phaseId: phase.id
      })
    }

    // Tasks validation
    if (!Array.isArray(phase.tasks)) {
      throw new TaskValidationError(`Phase ${phase.id} tasks must be an array`, 'INVALID_PHASE_TASKS', {
        phaseId: phase.id
      })
    }

    if (phase.tasks.length === 0) {
      throw new TaskValidationError(`Phase ${phase.id} must contain at least one task`, 'NO_PHASE_TASKS', {
        phaseId: phase.id
      })
    }

    // Duration validation
    if (typeof phase.estimated_duration !== 'number' || phase.estimated_duration < 0) {
      throw new TaskValidationError(`Phase ${phase.id} has invalid estimated duration`, 'INVALID_PHASE_DURATION', {
        phaseId: phase.id,
        value: phase.estimated_duration
      })
    }

    totalPhaseHours += phase.estimated_duration
  }

  // Validate phase dependencies
  for (const phase of plan.phases) {
    if (phase.dependencies) {
      for (const depId of phase.dependencies) {
        if (!phaseIds.has(depId)) {
          throw new TaskValidationError(
            `Phase dependency not found: ${depId}`,
            'MISSING_PHASE_DEPENDENCY',
            { phaseId: phase.id, dependencyId: depId }
          )
        }
      }
    }
  }

  // Validate total hours consistency (allow for small floating point differences)
  const hoursDifference = Math.abs(totalPhaseHours - plan.total_estimated_hours)
  if (hoursDifference > 0.01) {
    throw new TaskValidationError(
      'Total estimated hours does not match sum of phases',
      'INCONSISTENT_TOTAL_HOURS',
      {
        planTotal: plan.total_estimated_hours,
        phaseTotal: totalPhaseHours,
        difference: hoursDifference
      }
    )
  }

  // Validate required agents
  for (let i = 0; i < plan.required_agents.length; i++) {
    const agentId = plan.required_agents[i]
    if (!agentId || typeof agentId !== 'string' || agentId.trim().length === 0) {
      throw new TaskValidationError('Invalid required agent ID', 'INVALID_REQUIRED_AGENT', {
        index: i,
        value: agentId
      })
    }
  }
}

/**
 * Validates agent capabilities against task requirements
 */
export function validateAgentCapabilities(
  agentCapabilities: AgentCapability[],
  taskRequirements: string[],
  options: AgentValidationOptions = {}
): void {
  if (!Array.isArray(agentCapabilities) || agentCapabilities.length === 0) {
    throw new TaskValidationError('No agent capabilities provided', 'NO_AGENT_CAPABILITIES')
  }

  if (!Array.isArray(taskRequirements) || taskRequirements.length === 0) {
    throw new TaskValidationError('No task requirements provided', 'NO_TASK_REQUIREMENTS')
  }

  // Collect all available capabilities
  const availableCapabilities = new Set<string>()
  const specializedCapabilities = new Map<string, string>() // capability -> highest level

  for (const agent of agentCapabilities) {
    for (const capability of agent.capabilities) {
      availableCapabilities.add(capability)

      // Track specialization levels
      if (agent.specialization_level?.[capability]) {
        const currentLevel = specializedCapabilities.get(capability)
        const agentLevel = agent.specialization_level[capability]

        if (!currentLevel || getLevelValue(agentLevel) > getLevelValue(currentLevel)) {
          specializedCapabilities.set(capability, agentLevel)
        }
      }
    }
  }

  // Check each requirement
  const missingCapabilities: string[] = []
  const insufficientSpecialization: Array<{ capability: string; required: string; available: string }> = []

  for (const requirement of taskRequirements) {
    // Parse requirement (format: "capability" or "capability:level")
    const [capability, requiredLevel] = requirement.includes(':')
      ? requirement.split(':')
      : [requirement, null]

    // Check if capability is available
    if (!availableCapabilities.has(capability)) {
      missingCapabilities.push(capability)
      continue
    }

    // Check specialization level if required
    if (requiredLevel) {
      const availableLevel = specializedCapabilities.get(capability)
      if (!availableLevel || getLevelValue(availableLevel) < getLevelValue(requiredLevel)) {
        insufficientSpecialization.push({
          capability,
          required: requiredLevel,
          available: availableLevel || 'none'
        })
      }
    }
  }

  // Report missing capabilities
  if (missingCapabilities.length > 0) {
    throw new TaskValidationError(
      'Missing required capabilities',
      'MISSING_CAPABILITIES',
      { missingCapabilities }
    )
  }

  // Report insufficient specialization
  if (insufficientSpecialization.length > 0) {
    throw new TaskValidationError(
      'Insufficient agent specialization',
      'INSUFFICIENT_SPECIALIZATION',
      { insufficientSpecialization }
    )
  }

  // Check capacity constraints if workload is specified
  if (options.estimatedWorkload) {
    let totalAvailableCapacity = 0
    let totalCurrentLoad = 0

    for (const agent of agentCapabilities) {
      totalAvailableCapacity += agent.estimated_capacity
      totalCurrentLoad += agent.current_load || 0
    }

    const remainingCapacity = totalAvailableCapacity - totalCurrentLoad

    if (remainingCapacity < options.estimatedWorkload) {
      throw new TaskValidationError(
        'Insufficient agent capacity',
        'INSUFFICIENT_CAPACITY',
        {
          estimatedWorkload: options.estimatedWorkload,
          remainingCapacity,
          totalCapacity: totalAvailableCapacity,
          currentLoad: totalCurrentLoad
        }
      )
    }
  }
}

/**
 * Helper function to convert specialization level to numeric value for comparison
 */
function getLevelValue(level: string): number {
  const levels: Record<string, number> = {
    'beginner': 1,
    'intermediate': 2,
    'advanced': 3,
    'expert': 4
  }
  return levels[level] || 0
}

/**
 * Validates task estimation accuracy (can be used for post-execution analysis)
 */
export function validateTaskEstimation(
  estimatedHours: number,
  actualHours: number,
  tolerancePercent: number = 25
): { isAccurate: boolean; deviationPercent: number; recommendation: string } {
  const deviation = Math.abs(actualHours - estimatedHours)
  const deviationPercent = (deviation / estimatedHours) * 100

  const isAccurate = deviationPercent <= tolerancePercent

  let recommendation = ''
  if (!isAccurate) {
    if (actualHours > estimatedHours) {
      recommendation = 'Task took longer than expected. Consider breaking down similar tasks or increasing estimates.'
    } else {
      recommendation = 'Task completed faster than expected. Estimates might be too conservative.'
    }
  } else {
    recommendation = 'Estimation accuracy is within acceptable range.'
  }

  return {
    isAccurate,
    deviationPercent: Math.round(deviationPercent * 100) / 100,
    recommendation
  }
}

/**
 * Validates task priority against complexity and estimated hours
 */
export function validateTaskPriorityConsistency(
  priority: string,
  complexity: string,
  estimatedHours: number
): { isConsistent: boolean; warnings: string[] } {
  const warnings: string[] = []

  // High-priority tasks should generally not be low complexity with very few hours
  if (priority === 'critical' || priority === 'high') {
    if (complexity === 'low' && estimatedHours < 2) {
      warnings.push('High-priority task with low complexity and short duration - verify priority is correct')
    }
  }

  // Low-priority tasks should generally not be high complexity with many hours
  if (priority === 'low') {
    if (complexity === 'high' && estimatedHours > 20) {
      warnings.push('Low-priority task with high complexity and long duration - verify priority is correct')
    }
  }

  // Very long tasks should typically be higher priority
  if (estimatedHours > 40 && (priority === 'low' || priority === 'medium')) {
    warnings.push('Very long task with low/medium priority - consider breaking down or increasing priority')
  }

  return {
    isConsistent: warnings.length === 0,
    warnings
  }
}

// Re-export types for convenience
export type { TaskInput, ExecutionPlan, AgentCapability, TaskForValidation, AgentValidationOptions }