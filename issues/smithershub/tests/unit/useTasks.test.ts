/**
 * Unit tests for useTasks hook
 * Tests task planning state persistence and CRUD operations
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { useTasks } from '../../src/hooks/useTasks'

// Mock SQLite database
class MockDatabase {
  private data: Map<string, any[]> = new Map()

  constructor() {
    this.data.set('tasks', [])
    this.data.set('task_dependencies', [])
    this.data.set('task_agents', [])
  }

  run(sql: string, params?: any[]) {
    // Mock implementation for INSERT/UPDATE/DELETE
    if (sql.includes('INSERT INTO tasks')) {
      const tasks = this.data.get('tasks') || []
      tasks.push({
        id: params?.[0] || 'test-id',
        title: params?.[1] || 'Test Task',
        description: params?.[2] || 'Test Description',
        status: params?.[3] || 'pending',
        priority: params?.[4] || 'medium',
        estimated_hours: params?.[5] || 2,
        created_at: params?.[6] || '2024-01-01T00:00:00Z',
        updated_at: params?.[7] || '2024-01-01T00:00:00Z'
      })
    } else if (sql.includes('UPDATE tasks')) {
      // Mock update
    } else if (sql.includes('DELETE FROM tasks')) {
      this.data.set('tasks', [])
    }
    return { changes: 1, lastInsertRowid: 1 }
  }

  query<T = any>(sql: string, params?: any[]): T[] {
    if (sql.includes('SELECT * FROM tasks')) {
      return this.data.get('tasks') || []
    } else if (sql.includes('SELECT COUNT(*) as count FROM tasks')) {
      return [{ count: this.data.get('tasks')?.length || 0 }] as T[]
    }
    return []
  }

  queryOne<T = any>(sql: string, params?: any[]): T | null {
    const results = this.query<T>(sql, params)
    return results[0] || null
  }

  close() {}
}

describe('useTasks Hook', () => {
  let mockDb: MockDatabase

  beforeEach(() => {
    mockDb = new MockDatabase()
  })

  afterEach(() => {
    mockDb.close()
  })

  test('should initialize with empty tasks', () => {
    const hook = useTasks({ db: mockDb as any, autoInitialize: false })

    expect(hook.tasks).toEqual([])
    expect(hook.taskCount).toBe(0)
  })

  test('should create a new task with validation', async () => {
    const hook = useTasks({ db: mockDb as any })

    const taskData = {
      title: 'Implement feature X',
      description: 'Add feature X with proper tests',
      priority: 'high' as const,
      estimated_hours: 4,
      agents: ['agent-1', 'agent-2']
    }

    const taskId = await hook.createTask(taskData)

    expect(taskId).toMatch(/^[a-f0-9-]{36}$/) // UUID format
    expect(hook.taskCount).toBe(1)
  })

  test('should validate task creation input', async () => {
    const hook = useTasks({ db: mockDb as any })

    await expect(hook.createTask({
      title: '', // Invalid: empty title
      description: 'Test',
      priority: 'medium',
      estimated_hours: 2
    })).rejects.toThrow('Task title is required')

    await expect(hook.createTask({
      title: 'Valid title',
      description: 'Test',
      priority: 'invalid' as any, // Invalid priority
      estimated_hours: 2
    })).rejects.toThrow('Invalid priority level')
  })

  test('should update task status', async () => {
    const hook = useTasks({ db: mockDb as any })

    const taskId = await hook.createTask({
      title: 'Test Task',
      description: 'Test Description',
      priority: 'medium',
      estimated_hours: 2
    })

    await hook.updateTaskStatus(taskId, 'in_progress')

    const task = hook.getTaskById(taskId)
    expect(task?.status).toBe('in_progress')
  })

  test('should handle task delegation to agents', async () => {
    const hook = useTasks({ db: mockDb as any })

    const taskId = await hook.createTask({
      title: 'Delegated Task',
      description: 'Task to be delegated',
      priority: 'high',
      estimated_hours: 6,
      agents: ['agent-1', 'agent-2']
    })

    await hook.delegateToAgent(taskId, 'agent-1')

    const task = hook.getTaskById(taskId)
    expect(task?.assigned_agent).toBe('agent-1')
    expect(task?.status).toBe('delegated')
  })

  test('should manage task dependencies', async () => {
    const hook = useTasks({ db: mockDb as any })

    const task1Id = await hook.createTask({
      title: 'Task 1',
      description: 'First task',
      priority: 'high',
      estimated_hours: 2
    })

    const task2Id = await hook.createTask({
      title: 'Task 2',
      description: 'Second task',
      priority: 'medium',
      estimated_hours: 3,
      dependencies: [task1Id]
    })

    const dependencies = hook.getTaskDependencies(task2Id)
    expect(dependencies).toContain(task1Id)
  })

  test('should filter tasks by status', () => {
    const hook = useTasks({ db: mockDb as any })

    // Mock some tasks with different statuses
    const mockTasks = [
      { id: '1', status: 'pending', title: 'Task 1' },
      { id: '2', status: 'in_progress', title: 'Task 2' },
      { id: '3', status: 'completed', title: 'Task 3' },
      { id: '4', status: 'pending', title: 'Task 4' }
    ]

    mockDb.data?.set('tasks', mockTasks)

    const pendingTasks = hook.getTasksByStatus('pending')
    expect(pendingTasks).toHaveLength(2)
    expect(pendingTasks.every(task => task.status === 'pending')).toBe(true)
  })

  test('should calculate task execution statistics', async () => {
    const hook = useTasks({ db: mockDb as any })

    // Add mock execution history
    await hook.createTask({
      title: 'Completed Task 1',
      description: 'Task 1',
      priority: 'high',
      estimated_hours: 2
    })

    const stats = hook.getExecutionStats()
    expect(stats.totalTasks).toBe(1)
    expect(stats.completedTasks).toBe(0)
    expect(stats.pendingTasks).toBe(1)
  })

  test('should handle task planning workflow', async () => {
    const hook = useTasks({ db: mockDb as any })

    // Create a complex task breakdown
    const mainTaskId = await hook.createTask({
      title: 'Implement authentication system',
      description: 'Build complete auth system with tests',
      priority: 'critical',
      estimated_hours: 20,
      agents: ['backend-agent', 'frontend-agent', 'test-agent']
    })

    // Break down into subtasks
    const subtask1Id = await hook.createTask({
      title: 'Design auth database schema',
      description: 'Create tables for users, sessions, etc.',
      priority: 'high',
      estimated_hours: 4,
      dependencies: [],
      parent_task_id: mainTaskId
    })

    const subtask2Id = await hook.createTask({
      title: 'Implement auth API endpoints',
      description: 'Create login, logout, register endpoints',
      priority: 'high',
      estimated_hours: 8,
      dependencies: [subtask1Id],
      parent_task_id: mainTaskId
    })

    const subtask3Id = await hook.createTask({
      title: 'Write comprehensive tests',
      description: 'Unit and integration tests for auth',
      priority: 'medium',
      estimated_hours: 6,
      dependencies: [subtask2Id],
      parent_task_id: mainTaskId
    })

    const subtasks = hook.getSubtasks(mainTaskId)
    expect(subtasks).toHaveLength(3)

    const executionPlan = hook.getExecutionPlan(mainTaskId)
    expect(executionPlan.phases).toHaveLength(3) // Based on dependency chain
  })

  test('should handle error recovery', async () => {
    const hook = useTasks({ db: mockDb as any })

    const taskId = await hook.createTask({
      title: 'Failing Task',
      description: 'Task that might fail',
      priority: 'medium',
      estimated_hours: 2
    })

    await hook.recordTaskError(taskId, 'Simulated failure', 'NetworkError')

    const task = hook.getTaskById(taskId)
    expect(task?.status).toBe('failed')
    expect(task?.error_message).toBe('Simulated failure')
  })

  test('should persist state across hook instances', () => {
    const hook1 = useTasks({ db: mockDb as any })
    const hook2 = useTasks({ db: mockDb as any })

    // Both hooks should share the same underlying data
    expect(hook1.taskCount).toBe(hook2.taskCount)
  })

  test('should handle concurrent task operations', async () => {
    const hook = useTasks({ db: mockDb as any })

    // Simulate concurrent task creation
    const promises = Array.from({ length: 5 }, (_, i) =>
      hook.createTask({
        title: `Concurrent Task ${i}`,
        description: `Task created concurrently: ${i}`,
        priority: 'medium',
        estimated_hours: 1
      })
    )

    const taskIds = await Promise.all(promises)
    expect(taskIds).toHaveLength(5)
    expect(new Set(taskIds).size).toBe(5) // All unique
  })
})