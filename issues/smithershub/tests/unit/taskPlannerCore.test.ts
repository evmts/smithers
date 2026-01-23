/**
 * Core task planner functionality tests (non-React)
 * Tests the underlying logic without React hooks
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'

describe('Task Planner Core Logic', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeTestSchema(db)
  })

  afterEach(() => {
    db.close()
  })

  test('should initialize task database schema', () => {
    // Check that tables were created
    const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    const tableRows = stmt.all() as { name: string }[]
    const tables = tableRows.map(row => row.name)

    expect(tables).toContain('tasks')
    expect(tables).toContain('task_dependencies')
    expect(tables).toContain('task_agents')
  })

  test('should create and retrieve tasks', () => {
    const taskId = createTestTask(db, {
      title: 'Test Task',
      description: 'Test Description',
      priority: 'high',
      estimated_hours: 4
    })

    const task = getTaskById(db, taskId)
    expect(task).toBeDefined()
    expect(task?.title).toBe('Test Task')
    expect(task?.priority).toBe('high')
    expect(task?.estimated_hours).toBe(4)
  })

  test('should handle task dependencies', () => {
    const task1Id = createTestTask(db, {
      title: 'Task 1',
      description: 'First task',
      priority: 'high',
      estimated_hours: 2
    })

    const task2Id = createTestTask(db, {
      title: 'Task 2',
      description: 'Second task',
      priority: 'medium',
      estimated_hours: 3
    })

    // Add dependency
    addTaskDependency(db, task2Id, task1Id)

    const dependencies = getTaskDependencies(db, task2Id)
    expect(dependencies).toContain(task1Id)
  })

  test('should detect circular dependencies', () => {
    const task1Id = createTestTask(db, {
      title: 'Task 1',
      priority: 'high',
      estimated_hours: 2
    })

    const task2Id = createTestTask(db, {
      title: 'Task 2',
      priority: 'medium',
      estimated_hours: 3
    })

    // Create circular dependency
    addTaskDependency(db, task1Id, task2Id)

    expect(() => {
      addTaskDependency(db, task2Id, task1Id)
    }).toThrow('Circular dependency detected')
  })

  test('should update task status', () => {
    const taskId = createTestTask(db, {
      title: 'Test Task',
      priority: 'medium',
      estimated_hours: 2
    })

    updateTaskStatus(db, taskId, 'in_progress')

    const task = getTaskById(db, taskId)
    expect(task?.status).toBe('in_progress')
  })

  test('should delegate task to agent', () => {
    const taskId = createTestTask(db, {
      title: 'Delegated Task',
      priority: 'high',
      estimated_hours: 4
    })

    delegateTaskToAgent(db, taskId, 'agent-1')

    const task = getTaskById(db, taskId)
    expect(task?.assigned_agent).toBe('agent-1')
    expect(task?.status).toBe('delegated')
  })

  test('should calculate execution statistics', () => {
    // Create various tasks
    createTestTask(db, { title: 'Completed 1', priority: 'high', estimated_hours: 2 })
    createTestTask(db, { title: 'Completed 2', priority: 'medium', estimated_hours: 3 })
    createTestTask(db, { title: 'Pending 1', priority: 'low', estimated_hours: 1 })
    createTestTask(db, { title: 'Failed 1', priority: 'medium', estimated_hours: 2 })

    // Update statuses
    const tasks = getAllTasks(db)
    updateTaskStatus(db, tasks[0].id, 'completed')
    updateTaskStatus(db, tasks[1].id, 'completed')
    updateTaskStatus(db, tasks[3].id, 'failed')

    const stats = getExecutionStats(db)
    expect(stats.totalTasks).toBe(4)
    expect(stats.completedTasks).toBe(2)
    expect(stats.pendingTasks).toBe(1)
    expect(stats.failedTasks).toBe(1)
    expect(stats.successRate).toBe(0.5)
  })

  test('should build execution plan phases', () => {
    // Create tasks with dependencies
    const setupId = createTestTask(db, { title: 'Setup', priority: 'high', estimated_hours: 2 })
    const devId = createTestTask(db, { title: 'Development', priority: 'high', estimated_hours: 8 })
    const testId = createTestTask(db, { title: 'Testing', priority: 'medium', estimated_hours: 4 })
    const deployId = createTestTask(db, { title: 'Deployment', priority: 'low', estimated_hours: 2 })

    // Add dependencies: dev -> setup, test -> dev, deploy -> test
    addTaskDependency(db, devId, setupId)
    addTaskDependency(db, testId, devId)
    addTaskDependency(db, deployId, testId)

    const plan = generateExecutionPlan(db, [setupId, devId, testId, deployId])

    expect(plan.phases).toHaveLength(4) // Should create 4 phases
    expect(plan.total_estimated_hours).toBe(16)

    // Verify phase ordering respects dependencies
    expect(plan.phases[0].tasks).toContain(setupId)
    expect(plan.phases[3].tasks).toContain(deployId)
  })
})

// Helper functions to test core functionality without React hooks

function initializeTestSchema(db: Database) {
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
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, depends_on)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS task_agents (
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, agent_id)
    )
  `)
}

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function createTestTask(db: Database, input: {
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimated_hours: number
}): string {
  const taskId = generateId()
  const now = new Date().toISOString()

  const stmt = db.prepare(`
    INSERT INTO tasks (id, title, description, priority, estimated_hours, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(taskId, input.title, input.description || null, input.priority, input.estimated_hours, now, now)

  return taskId
}

function getTaskById(db: Database, id: string) {
  const stmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`)
  return stmt.get(id)
}

function getAllTasks(db: Database) {
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
  // Check for circular dependency
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

function generateExecutionPlan(db: Database, taskIds: string[]) {
  const tasks = taskIds.map(id => getTaskById(db, id)).filter(Boolean)
  const taskMap = new Map(tasks.map((task: any) => [task.id, task]))

  // Build dependency levels using topological sort
  const dependencyLevels = buildDependencyLevels(db, taskIds)

  const phases: any[] = []

  // Create phases based on dependency levels
  for (let level = 0; level < dependencyLevels.length; level++) {
    if (dependencyLevels[level].length > 0) {
      let totalDuration = 0

      for (const taskId of dependencyLevels[level]) {
        const task = taskMap.get(taskId)
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

  // Find tasks with no dependencies for level 0
  const findTasksForLevel = (excludeProcessed: boolean = true): string[] => {
    const candidates: string[] = []

    for (const taskId of taskIds) {
      if (excludeProcessed && processed.has(taskId)) continue

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

  // Build levels iteratively
  let currentLevel = 0
  while (processed.size < taskIds.length && currentLevel < 10) { // Safety limit
    const tasksForThisLevel = findTasksForLevel()

    if (tasksForThisLevel.length === 0) {
      // No more tasks can be processed, might be circular dependency
      // Add remaining tasks to current level
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