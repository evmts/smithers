import type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowStatus,
  PhaseExecution,
  PhaseStatusInfo
} from '../types/workflow-types.js'
import { DynamicPhase } from './dynamic-phase.js'

export class PhaseManager {
  private workflow?: WorkflowDefinition
  private context?: WorkflowContext
  private phases: Map<string, DynamicPhase> = new Map()
  private currentPhase?: string
  private executionHistory: PhaseExecution[] = []
  private phaseStatuses: Map<string, PhaseStatusInfo> = new Map()
  private startedAt?: Date
  private completedAt?: Date
  private status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' = 'pending'

  /**
   * Initialize the phase manager with a workflow definition
   */
  async initialize(
    workflow: WorkflowDefinition,
    context: WorkflowContext
  ): Promise<void> {
    this.workflow = workflow
    this.context = context
    this.phases.clear()
    this.phaseStatuses.clear()
    this.executionHistory = []
    this.startedAt = new Date()
    this.status = 'running'

    // Create dynamic phase instances
    for (const phaseDefinition of workflow.phases) {
      const phase = new DynamicPhase(phaseDefinition)
      this.phases.set(phaseDefinition.id, phase)

      // Initialize phase status
      this.phaseStatuses.set(phaseDefinition.id, {
        id: phaseDefinition.id,
        name: phaseDefinition.name,
        status: 'pending',
        executionCount: 0
      })
    }

    // Set initial phase
    this.currentPhase = workflow.initialPhase

    // Validate that initial phase exists
    if (!this.phases.has(workflow.initialPhase)) {
      throw new Error(`Initial phase '${workflow.initialPhase}' not found in workflow`)
    }

    // Update initial phase status
    const initialPhaseStatus = this.phaseStatuses.get(workflow.initialPhase)!
    initialPhaseStatus.status = 'running'
  }

  /**
   * Execute the current phase
   */
  async executeCurrentPhase(
    input: Record<string, any>
  ): Promise<PhaseExecution> {
    if (!this.currentPhase || !this.workflow || !this.context) {
      throw new Error('Phase manager not initialized')
    }

    const phase = this.phases.get(this.currentPhase)
    if (!phase) {
      throw new Error(`Phase '${this.currentPhase}' not found`)
    }

    // Update phase status to running
    const phaseStatus = this.phaseStatuses.get(this.currentPhase)!
    phaseStatus.status = 'running'
    phaseStatus.lastExecutedAt = new Date()
    phaseStatus.executionCount++

    try {
      // Execute the phase
      const execution = await phase.execute(input, this.context)

      // Add to execution history
      this.executionHistory.push(execution)

      // Update phase status based on execution result
      if (execution.status === 'completed') {
        phaseStatus.status = 'completed'

        // Automatically transition to next phase if possible
        if (execution.output) {
          const validTransitions = phase.evaluateTransitions(execution.output)
          if (validTransitions.length > 0) {
            // Use highest priority transition
            const nextTransition = validTransitions[0]
            if (nextTransition) {
              await this.transitionTo(nextTransition.targetPhase)
            }
          } else {
            // No valid transitions, workflow might be complete
            this.checkWorkflowCompletion()
          }
        }
      } else {
        phaseStatus.status = 'failed'
        this.status = 'failed'
      }

      return execution

    } catch (error) {
      phaseStatus.status = 'failed'
      this.status = 'failed'

      // Create failed execution record
      const failedExecution: PhaseExecution = {
        id: `exec_${Date.now()}_failed`,
        phaseId: this.currentPhase,
        workflowId: this.workflow.id,
        status: 'failed',
        startedAt: new Date(),
        completedAt: new Date(),
        input,
        context: this.context,
        error: error instanceof Error ? error.message : String(error)
      }

      this.executionHistory.push(failedExecution)
      return failedExecution
    }
  }

  /**
   * Manually transition to a specific phase
   */
  async transitionTo(phaseId: string): Promise<boolean> {
    if (!this.phases.has(phaseId)) {
      console.warn(`Cannot transition to unknown phase: ${phaseId}`)
      return false
    }

    // Update current phase status to completed (if it was running)
    if (this.currentPhase) {
      const currentPhaseStatus = this.phaseStatuses.get(this.currentPhase)!
      if (currentPhaseStatus.status === 'running') {
        currentPhaseStatus.status = 'completed'
      }
    }

    // Set new current phase
    this.currentPhase = phaseId

    // Update new phase status
    const newPhaseStatus = this.phaseStatuses.get(phaseId)!
    newPhaseStatus.status = 'running'

    // Check if this completes the workflow
    this.checkWorkflowCompletion()

    return true
  }

  /**
   * Get current workflow status
   */
  getWorkflowStatus(): WorkflowStatus {
    if (!this.workflow || !this.currentPhase) {
      throw new Error('Phase manager not initialized')
    }

    const workflowStatus: WorkflowStatus = {
      workflowId: this.workflow.id,
      currentPhase: this.currentPhase,
      status: this.status,
      phases: Array.from(this.phaseStatuses.values()),
      executionHistory: this.executionHistory
    }
    if (this.startedAt) {
      workflowStatus.startedAt = this.startedAt
    }
    if (this.completedAt) {
      workflowStatus.completedAt = this.completedAt
    }
    return workflowStatus
  }

  /**
   * Get the current phase ID
   */
  getCurrentPhase(): string | undefined {
    return this.currentPhase
  }

  /**
   * Get the workflow ID
   */
  getWorkflowId(): string | undefined {
    return this.workflow?.id
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): PhaseExecution[] {
    return [...this.executionHistory]
  }

  /**
   * Get a specific phase by ID
   */
  getPhase(phaseId: string): DynamicPhase | undefined {
    return this.phases.get(phaseId)
  }

  /**
   * Check if the workflow has reached a terminal state
   */
  private checkWorkflowCompletion(): void {
    if (!this.workflow || !this.currentPhase) return

    const currentPhase = this.phases.get(this.currentPhase)
    if (!currentPhase) return

    // Check if current phase has no valid transitions (terminal phase)
    const hasTransitions = currentPhase.transitions.length > 0

    if (!hasTransitions) {
      this.status = 'completed'
      this.completedAt = new Date()

      // Mark current phase as completed
      const phaseStatus = this.phaseStatuses.get(this.currentPhase)!
      phaseStatus.status = 'completed'
    }
  }

  /**
   * Cancel the workflow execution
   */
  async cancel(): Promise<void> {
    this.status = 'cancelled'
    this.completedAt = new Date()

    // Mark current phase as cancelled if it was running
    if (this.currentPhase) {
      const phaseStatus = this.phaseStatuses.get(this.currentPhase)!
      if (phaseStatus.status === 'running') {
        phaseStatus.status = 'pending' // Reset to pending state
      }
    }
  }

  /**
   * Get workflow definition
   */
  getWorkflowDefinition(): WorkflowDefinition | undefined {
    return this.workflow
  }

  /**
   * Get workflow context
   */
  getWorkflowContext(): WorkflowContext | undefined {
    return this.context
  }

  /**
   * Update workflow context
   */
  updateContext(updates: Partial<WorkflowContext>): void {
    if (this.context) {
      this.context = { ...this.context, ...updates }
    }
  }
}