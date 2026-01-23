/**
 * TaskPlanner component - comprehensive task planning and execution UI
 * Provides task creation, breakdown, dependency management, agent delegation, and execution
 */

import React, { useRef, useState } from 'react'
import { useTasks, type TaskInput, type Task, type ExecutionPlan } from '../hooks/useTasks'
import { usePlannerResult, type PlanExecutionOptions } from '../hooks/usePlannerResult'
import { validateTask, TaskValidationError } from '../utils/taskValidation'
import type { Database } from 'bun:sqlite'

// Component interfaces
export interface TaskPlannerProps {
  db?: Database
  agentSystem?: any
  enableRealTimeUpdates?: boolean
  onTaskCreate?: (task: Task) => void
  onTaskUpdate?: (task: Task) => void
  onPlanExecute?: (plan: ExecutionPlan) => void
}

export interface TaskFormData {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimated_hours: number
  complexity: 'low' | 'medium' | 'high'
  agents: string[]
}

export interface AgentInfo {
  id: string
  name: string
  capabilities: string[]
  status: 'available' | 'busy' | 'offline'
}

/**
 * TaskPlanner - Main task planning and execution component
 */
export function TaskPlanner(props: TaskPlannerProps) {
  const {
    db,
    agentSystem,
    enableRealTimeUpdates = false,
    onTaskCreate,
    onTaskUpdate,
    onPlanExecute
  } = props

  // Hooks
  const tasksHook = useTasks({ db })
  const plannerHook = usePlannerResult()

  // Local component state for UI
  const formRef = useRef<HTMLFormElement>(null)
  const [showSubtaskModal, setShowSubtaskModal] = useState(false)
  const [showDependencyModal, setShowDependencyModal] = useState(false)
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [selectedTaskForBreakdown, setSelectedTaskForBreakdown] = useState<string | null>(null)
  const [currentExecutionPlan, setCurrentExecutionPlan] = useState<ExecutionPlan | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([])

  // Form state
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    priority: 'medium',
    estimated_hours: 2,
    complexity: 'medium',
    agents: []
  })

  // Load available agents on mount
  React.useEffect(() => {
    if (agentSystem?.getAvailableAgents) {
      const agents = agentSystem.getAvailableAgents()
      setAvailableAgents(agents)
    }
  }, [agentSystem])

  // Form handlers
  const handleFormChange = (field: keyof TaskFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = (data: TaskFormData): boolean => {
    const errors: Record<string, string> = {}

    try {
      validateTask(data as TaskInput)
    } catch (error) {
      if (error instanceof TaskValidationError) {
        errors.general = error.message
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm(formData)) {
      return
    }

    try {
      const taskId = await tasksHook.createTask(formData as TaskInput)
      const createdTask = tasksHook.getTaskById(taskId)

      if (createdTask && onTaskCreate) {
        onTaskCreate(createdTask)
      }

      // Reset form
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        estimated_hours: 2,
        complexity: 'medium',
        agents: []
      })

      formRef.current?.reset()
    } catch (error) {
      setFormErrors({
        general: error instanceof Error ? error.message : 'Failed to create task'
      })
    }
  }

  const handleBreakdownTask = (taskId: string) => {
    setSelectedTaskForBreakdown(taskId)
    setShowSubtaskModal(true)
  }

  const handleSubtaskSubmit = async (subtaskData: TaskFormData) => {
    if (!selectedTaskForBreakdown) return

    try {
      const taskInput: TaskInput = {
        ...subtaskData,
        parent_task_id: selectedTaskForBreakdown
      }

      await tasksHook.createTask(taskInput)
    } catch (error) {
      console.error('Failed to create subtask:', error)
    }
  }

  const handleGenerateExecutionPlan = (taskId: string) => {
    try {
      const plan = tasksHook.getExecutionPlan(taskId)
      setCurrentExecutionPlan(plan)
    } catch (error) {
      console.error('Failed to generate execution plan:', error)
    }
  }

  const handleExecutePlan = async () => {
    if (!currentExecutionPlan || !agentSystem) return

    const options: PlanExecutionOptions = {
      agent: agentSystem,
      timeout: 30000,
      onProgress: (progress) => {
        console.log('Execution progress:', progress)
      },
      collectMetrics: true,
      saveToHistory: true
    }

    try {
      const result = await plannerHook.executePlan(currentExecutionPlan, options)

      if (onPlanExecute) {
        onPlanExecute(currentExecutionPlan)
      }

      console.log('Plan execution completed:', result)
    } catch (error) {
      console.error('Plan execution failed:', error)
    }
  }

  const handleDelegateToAgent = async (taskId: string, agentId: string) => {
    try {
      await tasksHook.delegateToAgent(taskId, agentId)

      const updatedTask = tasksHook.getTaskById(taskId)
      if (updatedTask && onTaskUpdate) {
        onTaskUpdate(updatedTask)
      }
    } catch (error) {
      console.error('Failed to delegate task:', error)
    }
  }

  return (
    <div className="task-planner">
      <header className="task-planner-header">
        <h1>Task Planner</h1>
        <div className="stats">
          <span>Total: {tasksHook.taskCount}</span>
          <span>Pending: {tasksHook.getTasksByStatus('pending').length}</span>
          <span>In Progress: {tasksHook.getTasksByStatus('in_progress').length}</span>
          <span>Completed: {tasksHook.getTasksByStatus('completed').length}</span>
        </div>
      </header>

      {/* Task Creation Form */}
      <section className="task-form-section">
        <h2>Create New Task</h2>
        <form ref={formRef} onSubmit={handleCreateTask} className="task-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-title">Task Title *</label>
              <input
                id="task-title"
                type="text"
                value={formData.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                placeholder="Enter task title"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="priority">Priority *</label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => handleFormChange('priority', e.target.value as any)}
                required
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="estimated-hours">Estimated Hours *</label>
              <input
                id="estimated-hours"
                type="number"
                min="0.5"
                step="0.5"
                value={formData.estimated_hours}
                onChange={(e) => handleFormChange('estimated_hours', parseFloat(e.target.value))}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="complexity">Complexity</label>
              <select
                id="complexity"
                value={formData.complexity}
                onChange={(e) => handleFormChange('complexity', e.target.value as any)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
              placeholder="Describe the task in detail"
              rows={3}
            />
          </div>

          {formErrors.general && (
            <div className="form-error" role="alert">
              {formErrors.general}
            </div>
          )}

          <button type="submit" className="create-task-btn">
            Create Task
          </button>
        </form>
      </section>

      {/* Task List */}
      <section className="task-list-section">
        <h2>Tasks</h2>
        <div className="task-list">
          {tasksHook.tasks.map((task, index) => (
            <TaskItem
              key={task.id}
              task={task}
              index={index}
              availableAgents={availableAgents}
              onBreakdown={() => handleBreakdownTask(task.id)}
              onGeneratePlan={() => handleGenerateExecutionPlan(task.id)}
              onDelegate={handleDelegateToAgent}
              onUpdate={onTaskUpdate}
            />
          ))}
        </div>
      </section>

      {/* Execution Plan Display */}
      {currentExecutionPlan && (
        <section className="execution-plan-section">
          <h2>Execution Plan</h2>
          <ExecutionPlanView
            plan={currentExecutionPlan}
            onExecute={handleExecutePlan}
            isExecuting={plannerHook.isExecuting}
          />
        </section>
      )}

      {/* Execution Progress */}
      {plannerHook.isExecuting && (
        <section className="execution-progress-section">
          <h2>Execution Progress</h2>
          <ExecutionProgressView
            progress={plannerHook.progress}
            status={plannerHook.status}
          />
        </section>
      )}

      {/* Execution Results */}
      {plannerHook.result && (
        <section className="execution-results-section">
          <h2>Execution Results</h2>
          <ExecutionResultsView result={plannerHook.result} />
        </section>
      )}

      {/* Error Display */}
      {plannerHook.error && (
        <section className="execution-error-section">
          <h2>Execution Error</h2>
          <div className="error-message" data-testid="execution-error">
            {plannerHook.error}
          </div>
          <button
            className="retry-btn"
            onClick={() => currentExecutionPlan && handleExecutePlan()}
          >
            Retry Execution
          </button>
        </section>
      )}

      {/* Modals */}
      {showSubtaskModal && (
        <SubtaskModal
          parentTaskId={selectedTaskForBreakdown}
          onClose={() => {
            setShowSubtaskModal(false)
            setSelectedTaskForBreakdown(null)
          }}
          onSubmit={handleSubtaskSubmit}
        />
      )}

      {showDependencyModal && (
        <DependencyModal
          tasks={tasksHook.tasks}
          onClose={() => setShowDependencyModal(false)}
          onSave={async (taskId, dependencies) => {
            // Implementation would update task dependencies
            console.log('Update dependencies:', taskId, dependencies)
          }}
        />
      )}

      {showAgentModal && (
        <AgentAssignmentModal
          tasks={tasksHook.tasks}
          agents={availableAgents}
          onClose={() => setShowAgentModal(false)}
          onAssign={handleDelegateToAgent}
        />
      )}

      {/* Control Buttons */}
      <div className="control-buttons">
        <button
          className="manage-dependencies-btn"
          onClick={() => setShowDependencyModal(true)}
        >
          Manage Dependencies
        </button>
        <button
          className="assign-agents-btn"
          onClick={() => setShowAgentModal(true)}
        >
          Assign Agents
        </button>
      </div>
    </div>
  )
}

// TaskItem sub-component
interface TaskItemProps {
  task: Task
  index: number
  availableAgents: AgentInfo[]
  onBreakdown: () => void
  onGeneratePlan: () => void
  onDelegate: (taskId: string, agentId: string) => void
  onUpdate?: (task: Task) => void
}

function TaskItem(props: TaskItemProps) {
  const { task, index, availableAgents, onBreakdown, onGeneratePlan, onDelegate } = props
  const [isEditing, setIsEditing] = useState(false)

  const priorityClass = {
    low: 'priority-low',
    medium: 'priority-medium',
    high: 'priority-high',
    critical: 'priority-critical'
  }[task.priority]

  const statusClass = {
    pending: 'status-pending',
    in_progress: 'status-progress',
    delegated: 'status-delegated',
    completed: 'status-completed',
    failed: 'status-failed'
  }[task.status]

  return (
    <div className={`task-item ${priorityClass} ${statusClass}`} data-testid={`task-item-${index}`}>
      <div className="task-header">
        <h3>{task.title}</h3>
        <div className="task-meta">
          <span className={`priority ${priorityClass}`}>{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority</span>
          <span className="duration">{task.estimated_hours} hours</span>
          <span className={`status ${statusClass}`} data-testid={`task-status-${task.id}`}>
            {task.status.replace('_', ' ').charAt(0).toUpperCase() + task.status.slice(1)}
          </span>
        </div>
      </div>

      {task.description && (
        <div className="task-description">
          {task.description}
        </div>
      )}

      {task.assigned_agent && (
        <div className="task-agent">
          Assigned to: {task.assigned_agent}
        </div>
      )}

      {task.error_message && (
        <div className="task-error">
          Error: {task.error_message}
        </div>
      )}

      <div className="task-actions">
        <button onClick={onBreakdown} className="breakdown-btn">
          Breakdown Task
        </button>
        <button onClick={onGeneratePlan} className="generate-plan-btn">
          Generate Execution Plan
        </button>
        <button onClick={() => setIsEditing(true)} className="edit-btn">
          Edit Task
        </button>

        {availableAgents.length > 0 && (
          <select
            onChange={(e) => e.target.value && onDelegate(task.id, e.target.value)}
            defaultValue=""
            className="delegate-select"
          >
            <option value="">Delegate to Agent...</option>
            {availableAgents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.status})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

// ExecutionPlanView sub-component
interface ExecutionPlanViewProps {
  plan: ExecutionPlan
  onExecute: () => void
  isExecuting: boolean
}

function ExecutionPlanView(props: ExecutionPlanViewProps) {
  const { plan, onExecute, isExecuting } = props

  return (
    <div className="execution-plan" data-testid="execution-plan">
      <div className="plan-header">
        <h3>{plan.title}</h3>
        <div className="plan-meta">
          <span>Total: {plan.total_estimated_hours}h</span>
          <span>Phases: {plan.phases.length}</span>
          <span>Agents: {plan.required_agents.length}</span>
        </div>
      </div>

      <div className="phases">
        {plan.phases.map((phase, index) => (
          <div key={phase.id} className="phase" data-testid={`execution-phase-${index}`}>
            <div className="phase-header">
              <h4>Phase {index + 1}: {phase.name}</h4>
              <span className="phase-duration">{phase.estimated_duration}h</span>
            </div>
            <div className="phase-tasks">
              {phase.tasks.map(taskId => (
                <div key={taskId} className="phase-task">
                  Task: {taskId}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onExecute}
        disabled={isExecuting}
        className="execute-plan-btn"
      >
        {isExecuting ? 'Executing...' : 'Execute Plan'}
      </button>
    </div>
  )
}

// ExecutionProgressView sub-component
interface ExecutionProgressViewProps {
  progress: any
  status: string
}

function ExecutionProgressView(props: ExecutionProgressViewProps) {
  const { progress, status } = props

  const progressPercentage = progress.total > 0
    ? (progress.completed / progress.total) * 100
    : 0

  return (
    <div className="execution-progress" data-testid="execution-progress">
      <div className="progress-info">
        <span>Status: {status}</span>
        <span>Progress: {progress.completed}/{progress.total}</span>
        {progress.current && <span>Current: {progress.current}</span>}
      </div>

      <div className="progress-bar-container">
        <div
          className="progress-bar"
          data-testid="execution-progress-bar"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {progress.estimatedTimeRemaining && (
        <div className="time-remaining">
          Estimated time remaining: {Math.round(progress.estimatedTimeRemaining / 1000)}s
        </div>
      )}
    </div>
  )
}

// ExecutionResultsView sub-component
interface ExecutionResultsViewProps {
  result: any
}

function ExecutionResultsView(props: ExecutionResultsViewProps) {
  const { result } = props

  return (
    <div className="execution-results" data-testid="execution-results">
      <div className="results-header">
        <h3>
          {result.status === 'completed' ? '✅ Execution Completed' :
           result.status === 'partial_success' ? '⚠️ Partial Success' :
           '❌ Execution Failed'}
        </h3>
      </div>

      <div className="results-summary">
        {result.summary}
      </div>

      <div className="results-metrics" data-testid="execution-metrics">
        <div>Tasks Completed: {result.metrics.tasksCompleted}</div>
        <div>Tasks Failed: {result.metrics.tasksError}</div>
        <div>Success Rate: {Math.round(result.metrics.successRate * 100)}%</div>
        <div>Total Duration: {Math.round(result.metrics.totalDuration / 1000)}s</div>
      </div>

      <div className="task-results">
        {result.results.map((taskResult: any, index: number) => (
          <div key={index} className="task-result" data-testid={`task-result-${index}`}>
            <span className="task-id">{taskResult.taskId}</span>
            <span className={`task-status ${taskResult.status}`}>
              {taskResult.status === 'completed' ? 'Completed' : 'Failed'}
            </span>
            {taskResult.error && (
              <span className="task-error">{taskResult.error}</span>
            )}
          </div>
        ))}
      </div>

      <div className="execution-summary" data-testid="execution-summary">
        Successfully executed {result.metrics.tasksCompleted} tasks
      </div>

      <button className="export-results-btn">
        Export Results
      </button>
    </div>
  )
}

// Placeholder modal components (would be implemented separately)
function SubtaskModal(props: any) {
  return <div data-testid="subtask-modal">Subtask Modal</div>
}

function DependencyModal(props: any) {
  return <div data-testid="dependency-modal">Dependency Modal</div>
}

function AgentAssignmentModal(props: any) {
  return <div data-testid="agent-assignment-modal">Agent Assignment Modal</div>
}