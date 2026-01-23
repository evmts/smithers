/**
 * Basic integration test for task planning system without React hooks
 * Tests the complete workflow using core functions
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'

describe('Task Planner Basic Integration', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  afterEach(() => {
    db.close()
  })

  test('should complete basic task planning workflow', () => {
    // Step 1: Create a project with subtasks
    const projectId = createTask(db, {
      title: 'E-commerce checkout system',
      description: 'Build complete checkout system',
      priority: 'critical',
      estimated_hours: 20
    })

    const backendId = createTask(db, {
      title: 'Backend API',
      description: 'Create checkout API endpoints',
      priority: 'high',
      estimated_hours: 8,
      parent_task_id: projectId
    })

    const frontendId = createTask(db, {
      title: 'Frontend UI',
      description: 'Build checkout user interface',
      priority: 'high',
      estimated_hours: 6,
      parent_task_id: projectId
    })

    const testingId = createTask(db, {
      title: 'Testing',
      description: 'Comprehensive tests',
      priority: 'medium',
      estimated_hours: 4,
      parent_task_id: projectId
    })

    const deploymentId = createTask(db, {
      title: 'Deployment',
      description: 'Deploy to production',
      priority: 'low',
      estimated_hours: 2,
      parent_task_id: projectId
    })

    // Step 2: Set up dependencies
    addTaskDependency(db, frontendId, backendId) // Frontend depends on backend
    addTaskDependency(db, testingId, backendId)  // Testing depends on backend
    addTaskDependency(db, testingId, frontendId) // Testing depends on frontend
    addTaskDependency(db, deploymentId, testingId) // Deployment depends on testing

    // Step 3: Generate execution plan
    const plan = generateExecutionPlan(db, [backendId, frontendId, testingId, deploymentId])

    expect(plan.phases).toHaveLength(4)
    expect(plan.total_estimated_hours).toBe(20)

    // Verify phase structure respects dependencies
    const phase1Tasks = plan.phases[0].tasks
    const phase2Tasks = plan.phases[1].tasks
    const phase3Tasks = plan.phases[2].tasks
    const phase4Tasks = plan.phases[3].tasks

    expect(phase1Tasks).toContain(backendId) // Backend has no dependencies
    expect(phase2Tasks).toContain(frontendId) // Frontend depends on backend
    expect(phase3Tasks).toContain(testingId) // Testing depends on both
    expect(phase4Tasks).toContain(deploymentId) // Deployment depends on testing

    // Step 4: Simulate task execution
    delegateTaskToAgent(db, backendId, 'backend-agent')
    delegateTaskToAgent(db, frontendId, 'frontend-agent')
    delegateTaskToAgent(db, testingId, 'test-agent')
    delegateTaskToAgent(db, deploymentId, 'devops-agent')

    // Step 5: Execute tasks in phase order
    // Phase 1: Backend
    updateTaskStatus(db, backendId, 'in_progress')
    updateTaskStatus(db, backendId, 'completed')

    // Phase 2: Frontend
    updateTaskStatus(db, frontendId, 'in_progress')
    updateTaskStatus(db, frontendId, 'completed')

    // Phase 3: Testing
    updateTaskStatus(db, testingId, 'in_progress')
    updateTaskStatus(db, testingId, 'completed')

    // Phase 4: Deployment
    updateTaskStatus(db, deploymentId, 'in_progress')
    updateTaskStatus(db, deploymentId, 'completed')

    // Step 6: Verify final state
    const stats = getExecutionStats(db)
    expect(stats.totalTasks).toBe(5) // Project + 4 subtasks
    expect(stats.completedTasks).toBe(4) // 4 subtasks completed
    expect(stats.successRate).toBe(0.8) // 4/5 = 0.8

    const allTasks = getAllTasks(db)
    const completedSubtasks = allTasks.filter(task =>
      task.parent_task_id === projectId && task.status === 'completed'
    )
    expect(completedSubtasks).toHaveLength(4)
  })

  test('should handle task validation during workflow', () => {
    // Try to create invalid task
    expect(() => {
      createTask(db, {
        title: '', // Invalid: empty title
        priority: 'high',
        estimated_hours: 4
      })
    }).toThrow('Task title is required')

    // Try to create circular dependency
    const task1 = createTask(db, {
      title: 'Task 1',
      priority: 'medium',
      estimated_hours: 2
    })

    const task2 = createTask(db, {
      title: 'Task 2',
      priority: 'medium',
      estimated_hours: 3
    })

    addTaskDependency(db, task1, task2)

    expect(() => {
      addTaskDependency(db, task2, task1)
    }).toThrow('Circular dependency detected')
  })

  test('should handle parallel execution scenarios', () => {
    // Create independent tasks that can run in parallel
    const task1 = createTask(db, {
      title: 'Independent Task 1',
      priority: 'medium',
      estimated_hours: 3
    })

    const task2 = createTask(db, {
      title: 'Independent Task 2',
      priority: 'medium',
      estimated_hours: 4
    })

    const task3 = createTask(db, {
      title: 'Dependent Task',
      priority: 'high',
      estimated_hours: 2
    })

    // Task3 depends on both Task1 and Task2
    addTaskDependency(db, task3, task1)
    addTaskDependency(db, task3, task2)

    const plan = generateExecutionPlan(db, [task1, task2, task3])

    expect(plan.phases).toHaveLength(2)

    // Phase 1 should contain both independent tasks
    expect(plan.phases[0].tasks).toContain(task1)
    expect(plan.phases[0].tasks).toContain(task2)
    expect(plan.phases[0].tasks).toHaveLength(2)

    // Phase 2 should contain the dependent task
    expect(plan.phases[1].tasks).toContain(task3)
    expect(plan.phases[1].tasks).toHaveLength(1)
  })

  test('should track agent workload', () => {
    // Create multiple tasks for the same agent
    const task1 = createTask(db, {
      title: 'Agent Task 1',
      priority: 'high',
      estimated_hours: 4
    })

    const task2 = createTask(db, {
      title: 'Agent Task 2',
      priority: 'medium',
      estimated_hours: 6
    })

    const task3 = createTask(db, {
      title: 'Agent Task 3',
      priority: 'low',
      estimated_hours: 2
    })

    // Delegate all to same agent
    delegateTaskToAgent(db, task1, 'full-stack-agent')
    delegateTaskToAgent(db, task2, 'full-stack-agent')
    delegateTaskToAgent(db, task3, 'full-stack-agent')

    // Get agent's tasks
    const agentTasks = getAgentTasks(db, 'full-stack-agent')
    expect(agentTasks).toHaveLength(3)

    const totalWorkload = agentTasks.reduce((sum, task) => sum + task.estimated_hours, 0)
    expect(totalWorkload).toBe(12)
  })

  test('should handle error scenarios gracefully', () => {
    const task = createTask(db, {
      title: 'Task that might fail',
      priority: 'medium',
      estimated_hours: 3
    })

    // Start execution
    updateTaskStatus(db, task, 'in_progress')

    // Record failure
    recordTaskError(db, task, 'Network connection failed', 'NetworkError')

    const updatedTask = getTaskById(db, task)
    expect(updatedTask.status).toBe('failed')
    expect(updatedTask.error_message).toBe('Network connection failed')
    expect(updatedTask.error_type).toBe('NetworkError')

    // Verify in statistics
    const stats = getExecutionStats(db)
    expect(stats.failedTasks).toBe(1)
    expect(stats.successRate).toBe(0)
  })
})

// Core functions used in integration tests

function initializeSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      estimated_hours REAL NOT NULL,
      assigned_agent TEXT,
      parent_task_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      error_message TEXT,
      error_type TEXT,
      complexity TEXT DEFAULT 'medium'
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      PRIMARY KEY (task_id, depends_on)
    )
  `)
}

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function createTask(db: Database, input: {
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimated_hours: number
  parent_task_id?: string
}): string {
  if (!input.title.trim()) {
    throw new Error('Task title is required')
  }

  const taskId = generateId()
  const now = new Date().toISOString()

  const stmt = db.prepare(`
    INSERT INTO tasks (id, title, description, priority, estimated_hours, parent_task_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    taskId,
    input.title,
    input.description || null,
    input.priority,
    input.estimated_hours,
    input.parent_task_id || null,
    now,
    now
  )

  return taskId
}

function getTaskById(db: Database, id: string): any {
  const stmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`)
  return stmt.get(id)
}

function getAllTasks(db: Database): any[] {
  const stmt = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`)
  return stmt.all()
}

function updateTaskStatus(db: Database, id: string, status: string) {
  const stmt = db.prepare(`UPDATE tasks SET status = ? WHERE id = ?`)
  stmt.run(status, id)
}

function delegateTaskToAgent(db: Database, taskId: string, agentId: string) {
  const stmt = db.prepare(`UPDATE tasks SET assigned_agent = ?, status = 'delegated' WHERE id = ?`)
  stmt.run(agentId, taskId)
}

function addTaskDependency(db: Database, taskId: string, dependsOn: string) {
  if (wouldCreateCircularDependency(db, taskId, dependsOn)) {
    throw new Error('Circular dependency detected')
  }

  const stmt = db.prepare(`INSERT OR IGNORE INTO task_dependencies (task_id, depends_on) VALUES (?, ?)`)
  stmt.run(taskId, dependsOn)
}

function getTaskDependencies(db: Database, taskId: string): string[] {
  const stmt = db.prepare(`SELECT depends_on FROM task_dependencies WHERE task_id = ?`)
  const deps = stmt.all(taskId) as { depends_on: string }[]
  return deps.map(dep => dep.depends_on)
}

function wouldCreateCircularDependency(db: Database, taskId: string, dependsOn: string): boolean {
  const visited = new Set<string>()

  const checkCycle = (currentId: string): boolean => {
    if (currentId === taskId) return true
    if (visited.has(currentId)) return false

    visited.add(currentId)
    const deps = getTaskDependencies(db, currentId)
    return deps.some(depId => checkCycle(depId))
  }

  return checkCycle(dependsOn)
}

function generateExecutionPlan(db: Database, taskIds: string[]) {
  const tasks = taskIds.map(id => getTaskById(db, id)).filter(Boolean)
  const dependencyLevels = buildDependencyLevels(db, taskIds)
  const phases: any[] = []

  for (let level = 0; level < dependencyLevels.length; level++) {
    if (dependencyLevels[level].length > 0) {
      let totalDuration = 0

      for (const taskId of dependencyLevels[level]) {
        const task = tasks.find((t: any) => t.id === taskId)
        if (task) {
          totalDuration += task.estimated_hours
        }
      }

      phases.push({
        id: `phase-${level + 1}`,
        name: `Phase ${level + 1}`,
        tasks: [...dependencyLevels[level]],
        estimated_duration: totalDuration
      })
    }
  }

  const totalHours = tasks.reduce((sum: number, task: any) => sum + task.estimated_hours, 0)

  return {
    id: `plan-${Date.now()}`,
    title: 'Generated Execution Plan',
    phases,
    total_estimated_hours: totalHours,
    required_agents: []
  }
}

function buildDependencyLevels(db: Database, taskIds: string[]): string[][] {
  const levels: string[][] = []
  const processed = new Set<string>()
  const taskSet = new Set(taskIds)

  const findTasksForLevel = (): string[] => {
    const candidates: string[] = []

    for (const taskId of taskIds) {
      if (processed.has(taskId)) continue

      const deps = getTaskDependencies(db, taskId)
      const unmetDeps = deps.filter(depId =>
        taskSet.has(depId) && !processed.has(depId)
      )

      if (unmetDeps.length === 0) {
        candidates.push(taskId)
      }
    }

    return candidates
  }

  let currentLevel = 0
  while (processed.size < taskIds.length && currentLevel < 10) {
    const tasksForThisLevel = findTasksForLevel()

    if (tasksForThisLevel.length === 0) {
      const remaining = taskIds.filter(id => !processed.has(id))
      if (remaining.length > 0) {
        levels[currentLevel] = remaining
        remaining.forEach(id => processed.add(id))
      }
      break
    }

    levels[currentLevel] = tasksForThisLevel
    tasksForThisLevel.forEach(id => processed.add(id))
    currentLevel++
  }

  return levels
}

function getAgentTasks(db: Database, agentId: string): any[] {
  const stmt = db.prepare(`SELECT * FROM tasks WHERE assigned_agent = ?`)
  return stmt.all(agentId)
}

function recordTaskError(db: Database, taskId: string, error: string, errorType?: string) {
  const stmt = db.prepare(`
    UPDATE tasks SET status = 'failed', error_message = ?, error_type = ?
    WHERE id = ?
  `)
  stmt.run(error, errorType || null, taskId)
}

function getExecutionStats(db: Database) {
  const tasks = getAllTasks(db)
  const total = tasks.length

  const completed = tasks.filter((t: any) => t.status === 'completed').length
  const pending = tasks.filter((t: any) => t.status === 'pending').length
  const inProgress = tasks.filter((t: any) => t.status === 'in_progress' || t.status === 'delegated').length
  const failed = tasks.filter((t: any) => t.status === 'failed').length

  return {
    totalTasks: total,
    completedTasks: completed,
    pendingTasks: pending,
    inProgressTasks: inProgress,
    failedTasks: failed,
    successRate: total > 0 ? completed / total : 0
  }
}