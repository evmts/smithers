/**
 * React hook for task planning and management with SQLite persistence
 * Follows project patterns: no useState, useRef for non-reactive state, SQLite for persistence
 */

import { useRef } from 'react'
import type { Database } from 'bun:sqlite'
import { useMount, useUnmount, useMountedState } from '../reconciler/hooks'

// Task interfaces
export interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'delegated' | 'completed' | 'failed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimated_hours: number
  assigned_agent?: string
  parent_task_id?: string
  created_at: string
  updated_at: string
  error_message?: string
  error_type?: string
  complexity?: 'low' | 'medium' | 'high'
}

export interface TaskInput {
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimated_hours: number
  agents?: string[]
  dependencies?: string[]
  parent_task_id?: string
  complexity?: 'low' | 'medium' | 'high'
  requiredCapabilities?: string[]
}

export interface TaskDependency {
  task_id: string
  depends_on: string
}

export interface ExecutionPlan {
  id: string
  title: string
  description?: string
  phases: ExecutionPhase[]
  total_estimated_hours: number
  required_agents: string[]
}

export interface ExecutionPhase {
  id: string
  name: string
  tasks: string[]
  estimated_duration: number
  dependencies?: string[]
  parallel?: boolean
  condition?: string
}

export interface ExecutionStats {
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  inProgressTasks: number
  failedTasks: number
  averageExecutionTime: number
  successRate: number
}

export interface UseTasksOptions {
  db?: Database
  autoInitialize?: boolean
}

export interface UseTasksHook {
  // State getters
  readonly tasks: Task[]
  readonly taskCount: number

  // Core operations
  createTask(input: TaskInput): Promise<string>
  updateTask(id: string, updates: Partial<Task>): Promise<void>
  deleteTask(id: string): Promise<void>
  updateTaskStatus(id: string, status: Task['status']): Promise<void>

  // Task retrieval
  getTaskById(id: string): Task | null
  getTasksByStatus(status: Task['status']): Task[]
  getSubtasks(parentId: string): Task[]
  getAllTasks(): Task[]

  // Dependency management
  addDependency(taskId: string, dependsOn: string): Promise<void>
  removeDependency(taskId: string, dependsOn: string): Promise<void>
  getTaskDependencies(taskId: string): string[]
  getDependentTasks(taskId: string): string[]

  // Agent delegation
  delegateToAgent(taskId: string, agentId: string): Promise<void>
  getAgentTasks(agentId: string): Task[]

  // Planning and execution
  getExecutionPlan(taskId: string): ExecutionPlan
  recordTaskError(taskId: string, error: string, errorType?: string): Promise<void>
  getExecutionStats(): ExecutionStats

  // Utility functions
  validateTaskChain(taskIds: string[]): boolean
  estimateTotalTime(taskIds: string[]): number
}

/**
 * Database schema initialization and queries
 */
function initializeTaskDb(db: Database) {
  // Tasks table
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
      complexity TEXT DEFAULT 'medium',
      FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `)

  // Task dependencies table
  db.run(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, depends_on),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `)

  // Task agents table (many-to-many relationship)
  db.run(`
    CREATE TABLE IF NOT EXISTS task_agents (
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, agent_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `)

  // Create indexes for performance
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)')
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent)')
  db.run('CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_dependencies(depends_on)')

  // Trigger to update updated_at timestamp
  db.run(`
    CREATE TRIGGER IF NOT EXISTS update_task_timestamp
    AFTER UPDATE ON tasks
    BEGIN
      UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
    END
  `)
}

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * React hook for task planning and management with SQLite persistence
 */
export function useTasks(options: UseTasksOptions = {}): UseTasksHook {
  const { db, autoInitialize = true } = options

  // Non-reactive state using useRef (following project patterns)
  const tasksRef = useRef<Task[]>([])
  const dbRef = useRef<Database | null>(db || null)
  const isMounted = useMountedState()

  // Initialize database and load tasks
  useMount(() => {
    if (autoInitialize && dbRef.current) {
      initializeTaskDb(dbRef.current)
      loadTasks()
    }
  })

  useUnmount(() => {
    // Cleanup resources if needed
  })

  const loadTasks = () => {
    if (!dbRef.current) return

    try {
      const tasks = dbRef.current.query<Task>(`
        SELECT * FROM tasks ORDER BY created_at DESC
      `)
      tasksRef.current = tasks
    } catch (error) {
      console.error('Failed to load tasks:', error)
      tasksRef.current = []
    }
  }

  const createTask = async (input: TaskInput): Promise<string> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized')
    }

    // Basic validation
    if (!input.title.trim()) {
      throw new Error('Task title is required')
    }

    if (!['low', 'medium', 'high', 'critical'].includes(input.priority)) {
      throw new Error('Invalid priority level')
    }

    if (input.estimated_hours <= 0) {
      throw new Error('Estimated hours must be positive')
    }

    const taskId = generateId()
    const now = new Date().toISOString()

    try {
      // Insert main task
      dbRef.current.run(`
        INSERT INTO tasks (
          id, title, description, status, priority, estimated_hours,
          parent_task_id, created_at, updated_at, complexity
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `, [
        taskId,
        input.title,
        input.description || null,
        input.priority,
        input.estimated_hours,
        input.parent_task_id || null,
        now,
        now,
        input.complexity || 'medium'
      ])

      // Insert agent associations if provided
      if (input.agents && input.agents.length > 0) {
        for (const agentId of input.agents) {
          if (agentId.trim()) {
            dbRef.current.run(`
              INSERT INTO task_agents (task_id, agent_id) VALUES (?, ?)
            `, [taskId, agentId])
          }
        }
      }

      // Insert dependencies if provided
      if (input.dependencies && input.dependencies.length > 0) {
        for (const depId of input.dependencies) {
          if (depId.trim()) {
            dbRef.current.run(`
              INSERT INTO task_dependencies (task_id, depends_on) VALUES (?, ?)
            `, [taskId, depId])
          }
        }
      }

      // Reload tasks
      if (isMounted()) {
        loadTasks()
      }

      return taskId
    } catch (error) {
      throw new Error(`Failed to create task: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const updateTask = async (id: string, updates: Partial<Task>): Promise<void> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized')
    }

    const allowedFields = [
      'title', 'description', 'status', 'priority', 'estimated_hours',
      'assigned_agent', 'error_message', 'error_type', 'complexity'
    ]

    const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key))
    if (updateFields.length === 0) {
      return
    }

    const setClause = updateFields.map(field => `${field} = ?`).join(', ')
    const values = updateFields.map(field => (updates as any)[field])
    values.push(id)

    try {
      dbRef.current.run(`
        UPDATE tasks SET ${setClause} WHERE id = ?
      `, values)

      if (isMounted()) {
        loadTasks()
      }
    } catch (error) {
      throw new Error(`Failed to update task: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const deleteTask = async (id: string): Promise<void> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized')
    }

    try {
      // Delete task (dependencies and agents will be cascade deleted)
      dbRef.current.run('DELETE FROM tasks WHERE id = ?', [id])

      if (isMounted()) {
        loadTasks()
      }
    } catch (error) {
      throw new Error(`Failed to delete task: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const updateTaskStatus = async (id: string, status: Task['status']): Promise<void> => {
    await updateTask(id, { status })
  }

  const getTaskById = (id: string): Task | null => {
    return tasksRef.current.find(task => task.id === id) || null
  }

  const getTasksByStatus = (status: Task['status']): Task[] => {
    return tasksRef.current.filter(task => task.status === status)
  }

  const getSubtasks = (parentId: string): Task[] => {
    return tasksRef.current.filter(task => task.parent_task_id === parentId)
  }

  const getAllTasks = (): Task[] => {
    return [...tasksRef.current]
  }

  const addDependency = async (taskId: string, dependsOn: string): Promise<void> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized')
    }

    if (taskId === dependsOn) {
      throw new Error('Task cannot depend on itself')
    }

    // Check for circular dependencies
    if (wouldCreateCircularDependency(taskId, dependsOn)) {
      throw new Error('Circular dependency detected')
    }

    try {
      dbRef.current.run(`
        INSERT OR IGNORE INTO task_dependencies (task_id, depends_on) VALUES (?, ?)
      `, [taskId, dependsOn])
    } catch (error) {
      throw new Error(`Failed to add dependency: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const removeDependency = async (taskId: string, dependsOn: string): Promise<void> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized')
    }

    try {
      dbRef.current.run(`
        DELETE FROM task_dependencies WHERE task_id = ? AND depends_on = ?
      `, [taskId, dependsOn])
    } catch (error) {
      throw new Error(`Failed to remove dependency: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const getTaskDependencies = (taskId: string): string[] => {
    if (!dbRef.current) return []

    try {
      const deps = dbRef.current.query<{ depends_on: string }>(`
        SELECT depends_on FROM task_dependencies WHERE task_id = ?
      `, [taskId])

      return deps.map(dep => dep.depends_on)
    } catch (error) {
      console.error('Failed to get task dependencies:', error)
      return []
    }
  }

  const getDependentTasks = (taskId: string): string[] => {
    if (!dbRef.current) return []

    try {
      const deps = dbRef.current.query<{ task_id: string }>(`
        SELECT task_id FROM task_dependencies WHERE depends_on = ?
      `, [taskId])

      return deps.map(dep => dep.task_id)
    } catch (error) {
      console.error('Failed to get dependent tasks:', error)
      return []
    }
  }

  const delegateToAgent = async (taskId: string, agentId: string): Promise<void> => {
    await updateTask(taskId, {
      assigned_agent: agentId,
      status: 'delegated'
    })
  }

  const getAgentTasks = (agentId: string): Task[] => {
    return tasksRef.current.filter(task => task.assigned_agent === agentId)
  }

  const getExecutionPlan = (taskId: string): ExecutionPlan => {
    const rootTask = getTaskById(taskId)
    if (!rootTask) {
      throw new Error(`Task ${taskId} not found`)
    }

    const subtasks = getSubtasks(taskId)
    const allTasks = subtasks.length > 0 ? subtasks : [rootTask]

    // Build dependency graph and create phases
    const phases = buildExecutionPhases(allTasks)

    const totalHours = allTasks.reduce((sum, task) => sum + task.estimated_hours, 0)
    const requiredAgents = Array.from(new Set(
      allTasks.map(task => task.assigned_agent).filter(Boolean) as string[]
    ))

    return {
      id: `plan-${taskId}`,
      title: `Execution Plan: ${rootTask.title}`,
      description: `Generated execution plan for ${rootTask.title}`,
      phases,
      total_estimated_hours: totalHours,
      required_agents: requiredAgents
    }
  }

  const recordTaskError = async (taskId: string, error: string, errorType?: string): Promise<void> => {
    await updateTask(taskId, {
      status: 'failed',
      error_message: error,
      error_type: errorType
    })
  }

  const getExecutionStats = (): ExecutionStats => {
    const tasks = getAllTasks()
    const total = tasks.length

    const completed = tasks.filter(t => t.status === 'completed').length
    const pending = tasks.filter(t => t.status === 'pending').length
    const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'delegated').length
    const failed = tasks.filter(t => t.status === 'failed').length

    return {
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: pending,
      inProgressTasks: inProgress,
      failedTasks: failed,
      averageExecutionTime: 0, // Would need execution history to calculate
      successRate: total > 0 ? completed / total : 0
    }
  }

  // Helper functions
  const wouldCreateCircularDependency = (taskId: string, dependsOn: string): boolean => {
    if (!dbRef.current) return false

    const visited = new Set<string>()
    const checkCycle = (currentId: string): boolean => {
      if (currentId === taskId) return true
      if (visited.has(currentId)) return false

      visited.add(currentId)

      const deps = getTaskDependencies(currentId)
      return deps.some(depId => checkCycle(depId))
    }

    return checkCycle(dependsOn)
  }

  const buildExecutionPhases = (tasks: Task[]): ExecutionPhase[] => {
    const taskMap = new Map(tasks.map(task => [task.id, task]))
    const phases: ExecutionPhase[] = []
    const processed = new Set<string>()

    // Topological sort to determine execution order
    const visit = (taskId: string, phase: number = 0): number => {
      if (processed.has(taskId)) return phase

      const task = taskMap.get(taskId)
      if (!task) return phase

      const deps = getTaskDependencies(taskId)
      let maxPhase = phase

      // Process dependencies first
      for (const depId of deps) {
        maxPhase = Math.max(maxPhase, visit(depId, phase))
      }

      // Ensure this phase exists
      while (phases.length <= maxPhase) {
        phases.push({
          id: `phase-${phases.length + 1}`,
          name: `Phase ${phases.length + 1}`,
          tasks: [],
          estimated_duration: 0
        })
      }

      // Add task to appropriate phase
      if (!phases[maxPhase].tasks.includes(taskId)) {
        phases[maxPhase].tasks.push(taskId)
        phases[maxPhase].estimated_duration += task.estimated_hours
      }

      processed.add(taskId)
      return maxPhase + 1
    }

    // Process all tasks
    for (const task of tasks) {
      if (!processed.has(task.id)) {
        visit(task.id)
      }
    }

    return phases.filter(phase => phase.tasks.length > 0)
  }

  const validateTaskChain = (taskIds: string[]): boolean => {
    try {
      for (const taskId of taskIds) {
        const deps = getTaskDependencies(taskId)
        for (const depId of deps) {
          if (!taskIds.includes(depId)) {
            return false // Missing dependency
          }
        }
      }
      return true
    } catch {
      return false
    }
  }

  const estimateTotalTime = (taskIds: string[]): number => {
    return taskIds.reduce((total, taskId) => {
      const task = getTaskById(taskId)
      return total + (task?.estimated_hours || 0)
    }, 0)
  }

  return {
    // State getters (computed on access)
    get tasks() { return [...tasksRef.current] },
    get taskCount() { return tasksRef.current.length },

    // Core operations
    createTask,
    updateTask,
    deleteTask,
    updateTaskStatus,

    // Task retrieval
    getTaskById,
    getTasksByStatus,
    getSubtasks,
    getAllTasks,

    // Dependency management
    addDependency,
    removeDependency,
    getTaskDependencies,
    getDependentTasks,

    // Agent delegation
    delegateToAgent,
    getAgentTasks,

    // Planning and execution
    getExecutionPlan,
    recordTaskError,
    getExecutionStats,

    // Utility functions
    validateTaskChain,
    estimateTotalTime
  }
}