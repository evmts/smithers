/**
 * End-to-end tests for task planning workflow
 * Tests complete user workflow from UI to execution
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { TaskPlanner } from '../../src/components/TaskPlanner'
import { SmithersProvider } from '../../src/providers/SmithersProvider'
import { Database } from 'bun:sqlite'

// Mock agent system for E2E testing
const mockAgentSystem = {
  async executePlan(plan: any) {
    // Simulate realistic execution time
    await new Promise(resolve => setTimeout(resolve, 200))

    return {
      id: `execution-${Date.now()}`,
      status: 'completed',
      results: plan.tasks?.map((task: any, index: number) => ({
        taskId: task.id || `task-${index}`,
        status: 'completed',
        output: `Executed ${task.title || `Task ${index + 1}`}`,
        executionTime: 100 + Math.floor(Math.random() * 400)
      })) || [],
      summary: `Successfully executed ${plan.tasks?.length || 0} tasks`,
      metrics: {
        totalDuration: 500 + Math.floor(Math.random() * 1000),
        tasksCompleted: plan.tasks?.length || 0,
        tasksError: 0,
        successRate: 1.0
      }
    }
  },

  getAvailableAgents() {
    return [
      { id: 'dev-agent', name: 'Development Agent', capabilities: ['javascript', 'react'] },
      { id: 'test-agent', name: 'Testing Agent', capabilities: ['testing', 'jest'] },
      { id: 'devops-agent', name: 'DevOps Agent', capabilities: ['deployment', 'docker'] }
    ]
  }
}

// Test wrapper component
function TaskPlannerWrapper({ children }: { children: React.ReactNode }) {
  const db = new Database(':memory:')

  // Initialize test schema
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      estimated_hours REAL,
      assigned_agent TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  return (
    <SmithersProvider db={db as any} agentSystem={mockAgentSystem}>
      {children}
    </SmithersProvider>
  )
}

describe('Task Planning Workflow E2E', () => {
  beforeEach(() => {
    // Reset any global state
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('should complete full task planning workflow', async () => {
    render(
      <TaskPlannerWrapper>
        <TaskPlanner />
      </TaskPlannerWrapper>
    )

    // Step 1: User creates a new task
    const titleInput = screen.getByLabelText(/task title/i)
    const descriptionInput = screen.getByLabelText(/description/i)
    const prioritySelect = screen.getByLabelText(/priority/i)
    const estimatedHoursInput = screen.getByLabelText(/estimated hours/i)
    const createButton = screen.getByRole('button', { name: /create task/i })

    fireEvent.change(titleInput, { target: { value: 'Build user dashboard' } })
    fireEvent.change(descriptionInput, {
      target: { value: 'Create comprehensive user dashboard with analytics' }
    })
    fireEvent.change(prioritySelect, { target: { value: 'high' } })
    fireEvent.change(estimatedHoursInput, { target: { value: '12' } })

    fireEvent.click(createButton)

    // Step 2: Verify task appears in task list
    await waitFor(() => {
      expect(screen.getByText('Build user dashboard')).toBeInTheDocument()
    })

    const taskItem = screen.getByTestId('task-item-0')
    expect(taskItem).toContainElement(screen.getByText('High Priority'))
    expect(taskItem).toContainElement(screen.getByText('12 hours'))

    // Step 3: User breaks down task into subtasks
    const breakdownButton = screen.getByRole('button', { name: /breakdown task/i })
    fireEvent.click(breakdownButton)

    // Add first subtask
    const subtaskModal = screen.getByTestId('subtask-modal')
    const subtaskTitleInput = screen.getByLabelText(/subtask title/i)

    fireEvent.change(subtaskTitleInput, { target: { value: 'Design dashboard layout' } })
    fireEvent.click(screen.getByRole('button', { name: /add subtask/i }))

    // Add second subtask
    fireEvent.change(subtaskTitleInput, { target: { value: 'Implement data visualization' } })
    fireEvent.click(screen.getByRole('button', { name: /add subtask/i }))

    // Add third subtask
    fireEvent.change(subtaskTitleInput, { target: { value: 'Add user interactions' } })
    fireEvent.click(screen.getByRole('button', { name: /add subtask/i }))

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Step 4: Verify subtasks are created
    await waitFor(() => {
      expect(screen.getByText('Design dashboard layout')).toBeInTheDocument()
      expect(screen.getByText('Implement data visualization')).toBeInTheDocument()
      expect(screen.getByText('Add user interactions')).toBeInTheDocument()
    })

    // Step 5: User sets up task dependencies
    const dependencyButton = screen.getByRole('button', { name: /manage dependencies/i })
    fireEvent.click(dependencyButton)

    const dependencyModal = screen.getByTestId('dependency-modal')

    // Set "Implement data visualization" to depend on "Design dashboard layout"
    const datavizTask = screen.getByTestId('dependency-task-dataviz')
    const designDependency = screen.getByTestId('dependency-option-design')

    fireEvent.click(designDependency)

    // Set "Add user interactions" to depend on "Implement data visualization"
    const interactionTask = screen.getByTestId('dependency-task-interactions')
    const datavizDependency = screen.getByTestId('dependency-option-dataviz')

    fireEvent.click(datavizDependency)

    fireEvent.click(screen.getByRole('button', { name: /save dependencies/i }))

    // Step 6: User assigns agents to tasks
    const assignAgentsButton = screen.getByRole('button', { name: /assign agents/i })
    fireEvent.click(assignAgentsButton)

    const agentModal = screen.getByTestId('agent-assignment-modal')

    // Assign development agent to design task
    const designTaskRow = screen.getByTestId('task-assignment-design')
    const devAgentSelect = screen.getByTestId('agent-select-design')

    fireEvent.change(devAgentSelect, { target: { value: 'dev-agent' } })

    // Assign development agent to dataviz task
    const datavizTaskRow = screen.getByTestId('task-assignment-dataviz')
    const datavizAgentSelect = screen.getByTestId('agent-select-dataviz')

    fireEvent.change(datavizAgentSelect, { target: { value: 'dev-agent' } })

    // Assign development agent to interactions task
    const interactionsTaskRow = screen.getByTestId('task-assignment-interactions')
    const interactionsAgentSelect = screen.getByTestId('agent-select-interactions')

    fireEvent.change(interactionsAgentSelect, { target: { value: 'dev-agent' } })

    fireEvent.click(screen.getByRole('button', { name: /save assignments/i }))

    // Step 7: Generate execution plan
    const generatePlanButton = screen.getByRole('button', { name: /generate execution plan/i })
    fireEvent.click(generatePlanButton)

    // Step 8: Review execution plan
    await waitFor(() => {
      expect(screen.getByTestId('execution-plan')).toBeInTheDocument()
    })

    const executionPlan = screen.getByTestId('execution-plan')

    // Verify plan structure
    expect(executionPlan).toContainElement(screen.getByText('Phase 1: Design'))
    expect(executionPlan).toContainElement(screen.getByText('Phase 2: Implementation'))
    expect(executionPlan).toContainElement(screen.getByText('Phase 3: Interactions'))

    // Verify task order respects dependencies
    const phases = screen.getAllByTestId(/execution-phase-/)
    expect(phases).toHaveLength(3)

    // Phase 1 should contain design task
    expect(phases[0]).toContainElement(screen.getByText('Design dashboard layout'))

    // Phase 2 should contain dataviz task
    expect(phases[1]).toContainElement(screen.getByText('Implement data visualization'))

    // Phase 3 should contain interactions task
    expect(phases[2]).toContainElement(screen.getByText('Add user interactions'))

    // Step 9: Execute the plan
    const executePlanButton = screen.getByRole('button', { name: /execute plan/i })
    fireEvent.click(executePlanButton)

    // Step 10: Monitor execution progress
    await waitFor(() => {
      expect(screen.getByTestId('execution-progress')).toBeInTheDocument()
    })

    const progressBar = screen.getByTestId('execution-progress-bar')
    expect(progressBar).toBeInTheDocument()

    // Wait for execution to start
    await waitFor(() => {
      expect(screen.getByText(/executing/i)).toBeInTheDocument()
    })

    // Wait for execution to complete
    await waitFor(() => {
      expect(screen.getByText(/execution completed/i)).toBeInTheDocument()
    }, { timeout: 5000 })

    // Step 11: Verify results
    const resultsSection = screen.getByTestId('execution-results')
    expect(resultsSection).toBeInTheDocument()

    // Check that all tasks show as completed
    const completedTasks = screen.getAllByTestId(/task-result-/)
    expect(completedTasks).toHaveLength(3)

    completedTasks.forEach(taskResult => {
      expect(taskResult).toContainElement(screen.getByText('Completed'))
    })

    // Check execution metrics
    const metricsSection = screen.getByTestId('execution-metrics')
    expect(metricsSection).toContainElement(screen.getByText('Tasks Completed: 3'))
    expect(metricsSection).toContainElement(screen.getByText('Success Rate: 100%'))

    // Step 12: View execution summary
    const summarySection = screen.getByTestId('execution-summary')
    expect(summarySection).toContainElement(screen.getByText(/Successfully executed 3 tasks/))

    // Step 13: Export results (optional)
    const exportButton = screen.getByRole('button', { name: /export results/i })
    fireEvent.click(exportButton)

    await waitFor(() => {
      expect(screen.getByTestId('export-confirmation')).toBeInTheDocument()
    })
  })

  test('should handle task planning errors gracefully', async () => {
    // Mock agent system to simulate failures
    const failingAgentSystem = {
      ...mockAgentSystem,
      async executePlan() {
        throw new Error('Agent execution failed')
      }
    }

    render(
      <SmithersProvider db={new Database(':memory:') as any} agentSystem={failingAgentSystem}>
        <TaskPlanner />
      </SmithersProvider>
    )

    // Create a simple task
    const titleInput = screen.getByLabelText(/task title/i)
    fireEvent.change(titleInput, { target: { value: 'Failing task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    // Try to execute
    const generatePlanButton = screen.getByRole('button', { name: /generate execution plan/i })
    fireEvent.click(generatePlanButton)

    const executePlanButton = screen.getByRole('button', { name: /execute plan/i })
    fireEvent.click(executePlanButton)

    // Should show error message
    await waitFor(() => {
      expect(screen.getByTestId('execution-error')).toBeInTheDocument()
    })

    const errorMessage = screen.getByTestId('execution-error')
    expect(errorMessage).toContainElement(screen.getByText(/execution failed/i))

    // Should show retry option
    const retryButton = screen.getByRole('button', { name: /retry execution/i })
    expect(retryButton).toBeInTheDocument()
  })

  test('should support task plan modification', async () => {
    render(
      <TaskPlannerWrapper>
        <TaskPlanner />
      </TaskPlannerWrapper>
    )

    // Create initial task
    const titleInput = screen.getByLabelText(/task title/i)
    fireEvent.change(titleInput, { target: { value: 'Modifiable task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    // Edit the task
    const editButton = screen.getByRole('button', { name: /edit task/i })
    fireEvent.click(editButton)

    const editTitleInput = screen.getByDisplayValue('Modifiable task')
    fireEvent.change(editTitleInput, { target: { value: 'Modified task title' } })

    const prioritySelect = screen.getByDisplayValue('medium')
    fireEvent.change(prioritySelect, { target: { value: 'high' } })

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // Verify changes
    await waitFor(() => {
      expect(screen.getByText('Modified task title')).toBeInTheDocument()
      expect(screen.getByText('High Priority')).toBeInTheDocument()
    })
  })

  test('should handle complex dependency chains', async () => {
    render(
      <TaskPlannerWrapper>
        <TaskPlanner />
      </TaskPlannerWrapper>
    )

    // Create multiple interconnected tasks
    const tasks = [
      { title: 'Setup project', priority: 'high' },
      { title: 'Database schema', priority: 'high' },
      { title: 'API endpoints', priority: 'medium' },
      { title: 'Frontend components', priority: 'medium' },
      { title: 'Integration tests', priority: 'low' },
      { title: 'Deployment', priority: 'low' }
    ]

    // Create all tasks
    for (const task of tasks) {
      const titleInput = screen.getByLabelText(/task title/i)
      const prioritySelect = screen.getByLabelText(/priority/i)

      fireEvent.change(titleInput, { target: { value: task.title } })
      fireEvent.change(prioritySelect, { target: { value: task.priority } })
      fireEvent.click(screen.getByRole('button', { name: /create task/i }))

      await waitFor(() => {
        expect(screen.getByText(task.title)).toBeInTheDocument()
      })
    }

    // Set up complex dependencies
    const dependencyButton = screen.getByRole('button', { name: /manage dependencies/i })
    fireEvent.click(dependencyButton)

    // Database schema depends on Setup project
    fireEvent.click(screen.getByTestId('dependency-db-setup'))

    // API endpoints depend on Database schema
    fireEvent.click(screen.getByTestId('dependency-api-db'))

    // Frontend components depend on API endpoints
    fireEvent.click(screen.getByTestId('dependency-frontend-api'))

    // Integration tests depend on both Frontend and API
    fireEvent.click(screen.getByTestId('dependency-tests-frontend'))
    fireEvent.click(screen.getByTestId('dependency-tests-api'))

    // Deployment depends on Integration tests
    fireEvent.click(screen.getByTestId('dependency-deploy-tests'))

    fireEvent.click(screen.getByRole('button', { name: /save dependencies/i }))

    // Generate execution plan
    fireEvent.click(screen.getByRole('button', { name: /generate execution plan/i }))

    // Verify correct phase ordering
    await waitFor(() => {
      const phases = screen.getAllByTestId(/execution-phase-/)
      expect(phases).toHaveLength(5) // Should create 5 phases based on dependencies

      // Verify phase 1 contains Setup project
      expect(phases[0]).toContainElement(screen.getByText('Setup project'))

      // Verify final phase contains Deployment
      expect(phases[4]).toContainElement(screen.getByText('Deployment'))
    })
  })

  test('should support real-time progress updates', async () => {
    // Mock WebSocket or SSE for real-time updates
    const mockEventSource = {
      listeners: new Map(),
      addEventListener(event: string, callback: Function) {
        this.listeners.set(event, callback)
      },
      simulateProgress(progress: any) {
        const callback = this.listeners.get('progress')
        if (callback) callback({ data: JSON.stringify(progress) })
      }
    }

    // Mock global EventSource
    global.EventSource = jest.fn().mockImplementation(() => mockEventSource)

    render(
      <TaskPlannerWrapper>
        <TaskPlanner enableRealTimeUpdates={true} />
      </TaskPlannerWrapper>
    )

    // Create and execute task
    const titleInput = screen.getByLabelText(/task title/i)
    fireEvent.change(titleInput, { target: { value: 'Real-time task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    fireEvent.click(screen.getByRole('button', { name: /generate execution plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /execute plan/i }))

    // Simulate progress updates
    await waitFor(() => {
      expect(screen.getByTestId('execution-progress')).toBeInTheDocument()
    })

    // Simulate progress events
    mockEventSource.simulateProgress({ completed: 0, total: 1, current: 'Starting task' })

    await waitFor(() => {
      expect(screen.getByText('Starting task')).toBeInTheDocument()
    })

    mockEventSource.simulateProgress({ completed: 1, total: 1, current: 'Task completed' })

    await waitFor(() => {
      expect(screen.getByText('Task completed')).toBeInTheDocument()
    })
  })

  test('should persist task planning state', async () => {
    const db = new Database(':memory:')

    // Initialize with some existing data
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
      )
    `)

    db.run(`INSERT INTO tasks (id, title, status) VALUES ('existing-task', 'Existing Task', 'completed')`)

    render(
      <SmithersProvider db={db as any} agentSystem={mockAgentSystem}>
        <TaskPlanner />
      </SmithersProvider>
    )

    // Should load existing task
    await waitFor(() => {
      expect(screen.getByText('Existing Task')).toBeInTheDocument()
    })

    const existingTaskStatus = screen.getByTestId('task-status-existing-task')
    expect(existingTaskStatus).toContainElement(screen.getByText('Completed'))

    // Add new task
    const titleInput = screen.getByLabelText(/task title/i)
    fireEvent.change(titleInput, { target: { value: 'New persistent task' } })
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    // Verify both tasks are present
    await waitFor(() => {
      expect(screen.getByText('Existing Task')).toBeInTheDocument()
      expect(screen.getByText('New persistent task')).toBeInTheDocument()
    })
  })
})