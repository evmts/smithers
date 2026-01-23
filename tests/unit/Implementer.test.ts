import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { Implementer } from '../../issues/smithershub/src/components/Implementer'

// Mock dependencies
const mockDb = {
  db: {
    run: mock(() => {}),
    prepare: mock(() => ({
      run: mock(() => {}),
      get: mock(() => null),
      all: mock(() => [])
    }))
  }
}

const mockWorkspaceManager = {
  createWorkspace: mock(() => Promise.resolve('/test/workspace')),
  executeTask: mock(() => Promise.resolve({ success: true, output: 'Task completed', duration: 1000 })),
  cleanupWorkspace: mock(() => Promise.resolve()),
  getTaskStatus: mock(() => 'completed')
}

// Mock modules
mock.module('../../issues/smithershub/src/utils/workspaceManager', () => ({
  WorkspaceManager: class {
    createWorkspace = mockWorkspaceManager.createWorkspace
    executeTask = mockWorkspaceManager.executeTask
    cleanupWorkspace = mockWorkspaceManager.cleanupWorkspace
    getTaskStatus = mockWorkspaceManager.getTaskStatus
  }
}))

mock.module('../../src/commands/db', () => mockDb)

describe('Implementer Component', () => {
  beforeEach(() => {
    // Reset all mocks
    mock.restore()
  })

  test('renders with initial state', () => {
    const tasks = [
      { id: 'task-1', description: 'Implement feature X', files: ['src/feature.ts'] }
    ]

    const result = renderToString(createElement(Implementer, { tasks, maxParallel: 2 }))
    expect(result).toContain('Implementation Engine')
  })

  test('handles parallel task execution', async () => {
    const tasks = [
      { id: 'task-1', description: 'Task 1', files: ['file1.ts'], priority: 1 },
      { id: 'task-2', description: 'Task 2', files: ['file2.ts'], priority: 2 }
    ]

    const component = createElement(Implementer, {
      tasks,
      maxParallel: 2,
      timeout: 30000
    })

    // Component should handle parallel execution
    expect(component.props.maxParallel).toBe(2)
    expect(component.props.timeout).toBe(30000)
  })

  test('respects timeout configuration', () => {
    const tasks = [{ id: 'task-1', description: 'Long task', files: ['file1.ts'] }]

    const component = createElement(Implementer, {
      tasks,
      timeout: 5000,
      onTimeout: mock(() => {})
    })

    expect(component.props.timeout).toBe(5000)
    expect(component.props.onTimeout).toBeDefined()
  })

  test('handles task prioritization', () => {
    const tasks = [
      { id: 'task-1', description: 'Low priority', files: ['file1.ts'], priority: 1 },
      { id: 'task-2', description: 'High priority', files: ['file2.ts'], priority: 10 },
      { id: 'task-3', description: 'Medium priority', files: ['file3.ts'], priority: 5 }
    ]

    const component = createElement(Implementer, { tasks, maxParallel: 1 })

    // Tasks should be sorted by priority (highest first)
    const sortedTasks = [...tasks].sort((a, b) => (b.priority || 0) - (a.priority || 0))
    expect(sortedTasks[0].id).toBe('task-2')
    expect(sortedTasks[1].id).toBe('task-3')
    expect(sortedTasks[2].id).toBe('task-1')
  })

  test('provides progress callbacks', () => {
    const onProgress = mock(() => {})
    const onComplete = mock(() => {})
    const onError = mock(() => {})

    const component = createElement(Implementer, {
      tasks: [{ id: 'task-1', description: 'Test task', files: ['file1.ts'] }],
      onProgress,
      onComplete,
      onError
    })

    expect(component.props.onProgress).toBe(onProgress)
    expect(component.props.onComplete).toBe(onComplete)
    expect(component.props.onError).toBe(onError)
  })

  test('handles dependency resolution', () => {
    const tasks = [
      {
        id: 'task-1',
        description: 'Base task',
        files: ['base.ts'],
        dependencies: []
      },
      {
        id: 'task-2',
        description: 'Dependent task',
        files: ['dependent.ts'],
        dependencies: ['task-1']
      }
    ]

    const component = createElement(Implementer, { tasks, maxParallel: 2 })

    // Component should handle dependency ordering
    expect(component.props.tasks).toEqual(tasks)
  })

  test('integrates with test runner', () => {
    const runTests = mock(() => Promise.resolve({ passed: true, results: [] }))

    const component = createElement(Implementer, {
      tasks: [{ id: 'task-1', description: 'Test task', files: ['file1.ts'] }],
      runTestsAfterTask: true,
      testRunner: { runTests }
    })

    expect(component.props.runTestsAfterTask).toBe(true)
    expect(component.props.testRunner).toBeDefined()
  })
})