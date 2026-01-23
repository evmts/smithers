/**
 * Integration tests for task planning system
 * Tests complete workflow from planning to execution
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { useTasks } from '../../src/hooks/useTasks'
import { usePlannerResult } from '../../src/hooks/usePlannerResult'
import { validateTask, validateExecutionPlan } from '../../src/utils/taskValidation'
import { Database } from 'bun:sqlite'

// Mock Agent System
class MockAgentSystem {
  private agents: Map<string, any> = new Map()

  registerAgent(id: string, capabilities: string[], capacity: number = 8) {
    this.agents.set(id, {
      id,
      capabilities,
      capacity,
      currentLoad: 0,
      status: 'available'
    })
  }

  getAgent(id: string) {
    return this.agents.get(id)
  }

  async executeTask(agentId: string, task: any): Promise<any> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    if (agent.status !== 'available') {
      throw new Error(`Agent ${agentId} is not available`)
    }

    // Simulate task execution
    agent.status = 'busy'
    await new Promise(resolve => setTimeout(resolve, 100)) // Simulate work

    agent.status = 'available'
    return {
      taskId: task.id,
      agentId,
      status: 'completed',
      output: `Task ${task.title} completed by ${agentId}`,
      executionTime: 100 + Math.floor(Math.random() * 500)
    }
  }

  async executePlan(plan: any): Promise<any> {
    const results = []
    let totalDuration = 0

    for (const task of plan.tasks || []) {
      const availableAgent = Array.from(this.agents.values())
        .find(agent => agent.status === 'available' &&
              agent.capabilities.some((cap: string) => task.requiredCapabilities?.includes(cap)))

      if (!availableAgent) {
        throw new Error(`No available agent for task ${task.id}`)
      }

      const result = await this.executeTask(availableAgent.id, task)
      results.push(result)
      totalDuration += result.executionTime
    }

    return {
      id: `result-${Date.now()}`,
      status: 'completed',
      results,
      summary: `Successfully executed ${results.length} tasks`,
      metrics: {
        totalDuration,
        tasksCompleted: results.length,
        tasksError: 0,
        successRate: 1.0
      }
    }
  }
}

describe('Task Planning Integration', () => {
  let db: Database
  let agentSystem: MockAgentSystem
  let tasksHook: ReturnType<typeof useTasks>
  let plannerHook: ReturnType<typeof usePlannerResult>

  beforeEach(() => {
    // Initialize in-memory SQLite database
    db = new Database(':memory:')

    // Initialize schema
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        estimated_hours REAL,
        assigned_agent TEXT,
        parent_task_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        error_message TEXT,
        error_type TEXT
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT,
        depends_on TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (depends_on) REFERENCES tasks(id)
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS task_agents (
        task_id TEXT,
        agent_id TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `)

    // Setup mock agent system
    agentSystem = new MockAgentSystem()
    agentSystem.registerAgent('full-stack-agent', ['javascript', 'typescript', 'react', 'node.js', 'database'])
    agentSystem.registerAgent('frontend-agent', ['javascript', 'typescript', 'react', 'css', 'html'])
    agentSystem.registerAgent('backend-agent', ['javascript', 'typescript', 'node.js', 'database', 'api'])
    agentSystem.registerAgent('test-agent', ['javascript', 'typescript', 'jest', 'cypress', 'testing'])
    agentSystem.registerAgent('devops-agent', ['docker', 'aws', 'ci/cd', 'deployment'])

    // Initialize hooks
    tasksHook = useTasks({ db: db as any, autoInitialize: true })
    plannerHook = usePlannerResult()
  })

  afterEach(() => {
    db.close()
  })

  test('should complete full task planning workflow', async () => {
    // Step 1: Create a complex project breakdown
    const mainTaskId = await tasksHook.createTask({
      title: 'Build e-commerce checkout system',
      description: 'Complete checkout system with payment processing',
      priority: 'critical',
      estimated_hours: 40,
      requiredCapabilities: ['javascript', 'react', 'node.js', 'database', 'payments']
    })

    // Step 2: Break down into subtasks
    const backendTaskId = await tasksHook.createTask({
      title: 'Backend API for checkout',
      description: 'Create REST API endpoints for checkout process',
      priority: 'high',
      estimated_hours: 16,
      parent_task_id: mainTaskId,
      agents: ['backend-agent'],
      requiredCapabilities: ['node.js', 'database', 'api']
    })

    const frontendTaskId = await tasksHook.createTask({
      title: 'Frontend checkout UI',
      description: 'Build React components for checkout flow',
      priority: 'high',
      estimated_hours: 12,
      parent_task_id: mainTaskId,
      dependencies: [backendTaskId],
      agents: ['frontend-agent'],
      requiredCapabilities: ['react', 'javascript', 'css']
    })

    const testingTaskId = await tasksHook.createTask({
      title: 'Comprehensive testing',
      description: 'Unit and integration tests for checkout system',
      priority: 'high',
      estimated_hours: 8,
      parent_task_id: mainTaskId,
      dependencies: [backendTaskId, frontendTaskId],
      agents: ['test-agent'],
      requiredCapabilities: ['testing', 'jest', 'cypress']
    })

    const deploymentTaskId = await tasksHook.createTask({
      title: 'Deploy to production',
      description: 'Deploy checkout system to production environment',
      priority: 'medium',
      estimated_hours: 4,
      parent_task_id: mainTaskId,
      dependencies: [testingTaskId],
      agents: ['devops-agent'],
      requiredCapabilities: ['deployment', 'docker', 'aws']
    })

    // Verify task creation
    expect(tasksHook.taskCount).toBe(5) // Main task + 4 subtasks

    const subtasks = tasksHook.getSubtasks(mainTaskId)
    expect(subtasks).toHaveLength(4)

    // Step 3: Validate all tasks
    const allTasks = tasksHook.getAllTasks()
    for (const task of allTasks) {
      expect(() => validateTask(task)).not.toThrow()
    }

    // Step 4: Generate execution plan
    const executionPlan = tasksHook.getExecutionPlan(mainTaskId)

    expect(executionPlan.phases).toHaveLength(4) // Based on dependency chain
    expect(executionPlan.total_estimated_hours).toBe(40)

    // Validate execution plan
    expect(() => validateExecutionPlan(executionPlan)).not.toThrow()

    // Step 5: Execute the plan
    const planResult = await plannerHook.executePlan(executionPlan, {
      agent: agentSystem as any,
      timeout: 10000,
      onProgress: (progress) => {
        console.log(`Progress: ${progress.completed}/${progress.total}`)
      }
    })

    // Step 6: Verify execution results
    expect(planResult.status).toBe('completed')
    expect(planResult.results).toHaveLength(4) // 4 subtasks executed
    expect(planResult.metrics.tasksCompleted).toBe(4)
    expect(planResult.metrics.successRate).toBe(1.0)

    // Step 7: Verify task status updates
    const completedTasks = tasksHook.getTasksByStatus('completed')
    expect(completedTasks).toHaveLength(4)

    const mainTask = tasksHook.getTaskById(mainTaskId)
    expect(mainTask?.status).toBe('completed')
  })

  test('should handle task dependency conflicts', async () => {
    // Create tasks with circular dependency
    const task1Id = await tasksHook.createTask({
      title: 'Task 1',
      description: 'First task',
      priority: 'medium',
      estimated_hours: 2
    })

    const task2Id = await tasksHook.createTask({
      title: 'Task 2',
      description: 'Second task',
      priority: 'medium',
      estimated_hours: 2,
      dependencies: [task1Id]
    })

    // Try to create circular dependency
    await expect(tasksHook.updateTask(task1Id, {
      dependencies: [task2Id]
    })).rejects.toThrow('Circular dependency detected')
  })

  test('should handle agent unavailability', async () => {
    // Create task requiring specific agent
    const taskId = await tasksHook.createTask({
      title: 'Specialized task',
      description: 'Task requiring rare skills',
      priority: 'high',
      estimated_hours: 4,
      agents: ['non-existent-agent'],
      requiredCapabilities: ['rare-skill']
    })

    const executionPlan = tasksHook.getExecutionPlan(taskId)

    // Execution should fail due to missing agent
    await expect(plannerHook.executePlan(executionPlan, {
      agent: agentSystem as any,
      timeout: 5000
    })).rejects.toThrow('No available agent for task')
  })

  test('should support parallel task execution', async () => {
    // Create tasks that can run in parallel
    const task1Id = await tasksHook.createTask({
      title: 'Parallel Task 1',
      description: 'Independent task',
      priority: 'medium',
      estimated_hours: 2,
      agents: ['frontend-agent'],
      requiredCapabilities: ['react']
    })

    const task2Id = await tasksHook.createTask({
      title: 'Parallel Task 2',
      description: 'Another independent task',
      priority: 'medium',
      estimated_hours: 2,
      agents: ['backend-agent'],
      requiredCapabilities: ['node.js']
    })

    const combinedPlan = {
      id: 'parallel-plan',
      title: 'Parallel Execution Plan',
      description: 'Execute tasks in parallel',
      phases: [
        {
          id: 'phase-1',
          name: 'Parallel Phase',
          tasks: [task1Id, task2Id],
          estimated_duration: 2, // Should be max of individual durations
          parallel: true
        }
      ],
      total_estimated_hours: 2, // Parallel execution
      required_agents: ['frontend-agent', 'backend-agent']
    }

    const startTime = Date.now()
    const result = await plannerHook.executePlan(combinedPlan, {
      agent: agentSystem as any,
      allowParallel: true
    })
    const endTime = Date.now()

    expect(result.status).toBe('completed')
    expect(result.results).toHaveLength(2)

    // Parallel execution should be faster than sequential
    const executionTime = endTime - startTime
    expect(executionTime).toBeLessThan(400) // Less than sum of individual times
  })

  test('should handle task failure and recovery', async () => {
    // Mock agent that fails on first attempt
    const unreliableAgent = {
      attempts: 0,
      async executePlan(plan: any) {
        this.attempts++
        if (this.attempts === 1) {
          throw new Error('First attempt failed')
        }
        return agentSystem.executePlan(plan)
      }
    }

    const taskId = await tasksHook.createTask({
      title: 'Unreliable task',
      description: 'Task that might fail',
      priority: 'medium',
      estimated_hours: 2,
      agents: ['full-stack-agent'],
      requiredCapabilities: ['javascript']
    })

    const executionPlan = tasksHook.getExecutionPlan(taskId)

    // Should succeed on retry
    const result = await plannerHook.executePlan(executionPlan, {
      agent: unreliableAgent as any,
      retries: 2,
      retryDelay: 50
    })

    expect(result.status).toBe('completed')
    expect(plannerHook.retryCount).toBe(1)
  })

  test('should track execution metrics and performance', async () => {
    const startTime = Date.now()

    // Create multiple tasks
    const taskIds = await Promise.all([
      tasksHook.createTask({
        title: 'Metrics Task 1',
        description: 'Task for metrics',
        priority: 'high',
        estimated_hours: 1,
        agents: ['frontend-agent']
      }),
      tasksHook.createTask({
        title: 'Metrics Task 2',
        description: 'Task for metrics',
        priority: 'medium',
        estimated_hours: 2,
        agents: ['backend-agent']
      }),
      tasksHook.createTask({
        title: 'Metrics Task 3',
        description: 'Task for metrics',
        priority: 'low',
        estimated_hours: 1,
        agents: ['test-agent']
      })
    ])

    const executionPlan = {
      id: 'metrics-plan',
      title: 'Metrics Collection Plan',
      phases: [
        {
          id: 'phase-1',
          name: 'Execute All',
          tasks: taskIds,
          estimated_duration: 4
        }
      ],
      total_estimated_hours: 4,
      required_agents: ['frontend-agent', 'backend-agent', 'test-agent']
    }

    const result = await plannerHook.executePlan(executionPlan, {
      agent: agentSystem as any,
      collectMetrics: true
    })

    const executionStats = tasksHook.getExecutionStats()

    expect(result.metrics).toBeDefined()
    expect(result.metrics.totalDuration).toBeGreaterThan(0)
    expect(executionStats.completedTasks).toBe(3)
    expect(executionStats.averageExecutionTime).toBeGreaterThan(0)

    const history = plannerHook.getExecutionHistory()
    expect(history).toHaveLength(1)
    expect(history[0].status).toBe('completed')
  })

  test('should support task plan modification during execution', async () => {
    // Create initial plan
    const taskId = await tasksHook.createTask({
      title: 'Modifiable task',
      description: 'Task that can be modified',
      priority: 'medium',
      estimated_hours: 4,
      agents: ['full-stack-agent']
    })

    const executionPlan = tasksHook.getExecutionPlan(taskId)

    // Start execution
    const executionPromise = plannerHook.executePlan(executionPlan, {
      agent: agentSystem as any,
      allowModification: true
    })

    // Modify task during execution (simulate priority change)
    await new Promise(resolve => setTimeout(resolve, 50))
    await tasksHook.updateTask(taskId, {
      priority: 'high',
      estimated_hours: 6
    })

    const result = await executionPromise

    expect(result.status).toBe('completed')

    const updatedTask = tasksHook.getTaskById(taskId)
    expect(updatedTask?.priority).toBe('high')
  })

  test('should integrate with external systems', async () => {
    // Mock external system integration
    const externalSystemMock = {
      notifications: [] as any[],
      async notify(event: string, data: any) {
        this.notifications.push({ event, data, timestamp: new Date() })
      }
    }

    const taskId = await tasksHook.createTask({
      title: 'External integration task',
      description: 'Task with external notifications',
      priority: 'high',
      estimated_hours: 2,
      agents: ['full-stack-agent'],
      externalIntegrations: ['notification-service']
    })

    const executionPlan = tasksHook.getExecutionPlan(taskId)

    const result = await plannerHook.executePlan(executionPlan, {
      agent: agentSystem as any,
      onTaskStart: (task) => externalSystemMock.notify('task_started', { taskId: task.id }),
      onTaskComplete: (task) => externalSystemMock.notify('task_completed', { taskId: task.id })
    })

    expect(result.status).toBe('completed')
    expect(externalSystemMock.notifications).toHaveLength(2)
    expect(externalSystemMock.notifications[0].event).toBe('task_started')
    expect(externalSystemMock.notifications[1].event).toBe('task_completed')
  })
})