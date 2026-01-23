import type {
  PhaseEngine,
  PhaseDefinition,
  PhaseExecution,
  PhaseContext,
  ExecutionFilters,
  PhaseStep,
  StepExecution,
  AgentExecution,
  PhaseEvent,
  XMLParseError,
  TransitionManager
} from './types.js'
import type { XMLPhaseParser } from './xml-parser.ts'

/**
 * Default implementation of PhaseEngine
 * Orchestrates the execution of dynamic phases with XML-defined workflows
 */
export class DefaultPhaseEngine implements PhaseEngine {
  private executions = new Map<string, PhaseExecution>()
  private eventHandlers: ((event: PhaseEvent) => void)[] = []

  constructor(
    private xmlParser: XMLPhaseParser,
    private transitionManager: TransitionManager
  ) {
    // Subscribe to transition manager events
    this.transitionManager.onEvent = (event) => this.emitEvent(event)
  }

  async loadDefinition(xml: string): Promise<PhaseDefinition> {
    const parseResult = await this.xmlParser.parse(xml)

    if (parseResult.errors.length > 0) {
      const errorMessages = parseResult.errors.map(e => e.message).join('; ')
      throw new Error(`XML parsing failed: ${errorMessages}`)
    }

    // Warnings are logged but don't prevent loading
    if (parseResult.warnings.length > 0) {
      console.warn('Phase definition warnings:', parseResult.warnings)
    }

    return parseResult.definition
  }

  async executePhase(
    definition: PhaseDefinition,
    contextOverrides?: Partial<PhaseContext>
  ): Promise<PhaseExecution> {
    const execution = this.createExecution(definition, contextOverrides)
    this.executions.set(execution.id, execution)

    try {
      this.emitEvent({
        type: 'phase_started',
        executionId: execution.id,
        timestamp: new Date().toISOString()
      })

      execution.status = 'running'
      await this.executePhaseSteps(execution, definition)

      if (execution.status === 'running') {
        execution.status = 'completed'
        execution.completedAt = new Date().toISOString()

        this.emitEvent({
          type: 'phase_completed',
          executionId: execution.id,
          timestamp: execution.completedAt
        })
      }

    } catch (error) {
      execution.status = 'failed'
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      execution.completedAt = new Date().toISOString()

      this.emitEvent({
        type: 'phase_failed',
        executionId: execution.id,
        data: { error: execution.error },
        timestamp: execution.completedAt
      })
    }

    return execution
  }

  async pauseExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId)
    if (execution && ['running', 'completed'].includes(execution.status)) {
      execution.status = 'paused'
    }
  }

  async resumeExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId)
    if (execution && execution.status === 'paused') {
      execution.status = 'running'
      // In a real implementation, you'd resume from the current step
    }
  }

  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId)
    if (execution && ['running', 'paused', 'completed'].includes(execution.status)) {
      execution.status = 'cancelled'
      execution.completedAt = new Date().toISOString()
    }
  }

  async getExecution(executionId: string): Promise<PhaseExecution | null> {
    return this.executions.get(executionId) || null
  }

  async listExecutions(filters?: ExecutionFilters): Promise<PhaseExecution[]> {
    let executions = Array.from(this.executions.values())

    if (filters) {
      if (filters.status) {
        executions = executions.filter(e => filters.status!.includes(e.status))
      }

      if (filters.phaseDefinitionId) {
        executions = executions.filter(e => e.phaseDefinitionId === filters.phaseDefinitionId)
      }

      if (filters.startedAfter) {
        const afterDate = new Date(filters.startedAfter)
        executions = executions.filter(e => new Date(e.startedAt) > afterDate)
      }

      if (filters.startedBefore) {
        const beforeDate = new Date(filters.startedBefore)
        executions = executions.filter(e => new Date(e.startedAt) < beforeDate)
      }

      if (filters.offset) {
        executions = executions.slice(filters.offset)
      }

      if (filters.limit) {
        executions = executions.slice(0, filters.limit)
      }
    }

    // Sort by started time, most recent first
    return executions.sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
  }

  public onEvent(handler: (event: PhaseEvent) => void): void {
    this.eventHandlers.push(handler)
  }

  private createExecution(
    definition: PhaseDefinition,
    contextOverrides?: Partial<PhaseContext>
  ): PhaseExecution {
    const baseContext: PhaseContext = {
      variables: { ...definition.variables },
      state: {},
      artifacts: {},
      metadata: {}
    }

    const context: PhaseContext = {
      variables: { ...baseContext.variables, ...contextOverrides?.variables },
      state: { ...baseContext.state, ...contextOverrides?.state },
      artifacts: { ...baseContext.artifacts, ...contextOverrides?.artifacts },
      metadata: { ...baseContext.metadata, ...contextOverrides?.metadata }
    }

    return {
      id: this.generateId(),
      phaseDefinitionId: definition.id,
      status: 'pending',
      currentStepId: definition.initialStep,
      startedAt: new Date().toISOString(),
      context,
      stepExecutions: [],
      artifacts: []
    }
  }

  private async executePhaseSteps(
    execution: PhaseExecution,
    definition: PhaseDefinition
  ): Promise<void> {
    let currentStepId = execution.currentStepId

    while (currentStepId && execution.status === 'running') {
      const step = definition.steps.find(s => s.id === currentStepId)
      if (!step) {
        throw new Error(`Step '${currentStepId}' not found in phase definition`)
      }

      // Execute the current step
      const stepExecution = await this.executeStep(execution, step, definition)
      execution.stepExecutions.push(stepExecution)

      // Check if we've reached a final step
      if (definition.finalSteps.includes(currentStepId)) {
        execution.currentStepId = currentStepId // Keep the final step ID
        break
      }

      // Determine next step using transition manager
      const nextStepId = await this.transitionManager.evaluateTransitions(
        execution,
        stepExecution.output,
        definition
      )

      execution.currentStepId = nextStepId
      currentStepId = nextStepId
    }
  }

  private async executeStep(
    execution: PhaseExecution,
    step: PhaseStep,
    definition: PhaseDefinition
  ): Promise<StepExecution> {
    const stepExecution: StepExecution = {
      id: this.generateId(),
      stepId: step.id,
      phaseExecutionId: execution.id,
      status: 'pending',
      input: step.config || {},
      agentExecutions: [],
      retryCount: 0
    }

    try {
      this.emitEvent({
        type: 'step_started',
        executionId: execution.id,
        stepId: step.id,
        timestamp: new Date().toISOString()
      })

      stepExecution.status = 'running'
      stepExecution.startedAt = new Date().toISOString()

      // Simulate step execution based on type
      const result = await this.executeStepByType(step, stepExecution, execution)

      stepExecution.output = result
      stepExecution.status = 'completed'
      stepExecution.completedAt = new Date().toISOString()

      this.emitEvent({
        type: 'step_completed',
        executionId: execution.id,
        stepId: step.id,
        data: { output: result },
        timestamp: stepExecution.completedAt
      })

    } catch (error) {
      stepExecution.status = 'failed'
      stepExecution.error = error instanceof Error ? error.message : 'Unknown error'
      stepExecution.completedAt = new Date().toISOString()

      this.emitEvent({
        type: 'step_failed',
        executionId: execution.id,
        stepId: step.id,
        data: { error: stepExecution.error },
        timestamp: stepExecution.completedAt
      })

      throw new Error(`Step execution failed: ${stepExecution.error}`)
    }

    return stepExecution
  }

  private async executeStepByType(
    step: PhaseStep,
    stepExecution: StepExecution,
    execution: PhaseExecution
  ): Promise<any> {
    // This is a mock implementation for testing
    // In a real implementation, you'd have specific handlers for each step type

    switch (step.type) {
      case 'action':
        return this.executeActionStep(step, stepExecution, execution)

      case 'condition':
        return this.executeConditionStep(step, stepExecution, execution)

      case 'parallel':
        return this.executeParallelStep(step, stepExecution, execution)

      case 'sequence':
        return this.executeSequenceStep(step, stepExecution, execution)

      default:
        throw new Error(`Unknown step type: ${step.type}`)
    }
  }

  private async executeActionStep(
    step: PhaseStep,
    stepExecution: StepExecution,
    execution: PhaseExecution
  ): Promise<any> {
    // Mock action step execution
    const config = step.config || {}

    // Check for simulated errors
    if (config.throwError || config.simulateError) {
      throw new Error('Simulated step error')
    }

    // Execute any configured agents
    if (step.agents) {
      for (const agentConfig of step.agents) {
        const agentExecution = await this.executeAgent(agentConfig, stepExecution)
        stepExecution.agentExecutions.push(agentExecution)
      }
    }

    // Return success result
    return { status: 'completed', result: 'success', data: config }
  }

  private async executeConditionStep(
    step: PhaseStep,
    stepExecution: StepExecution,
    execution: PhaseExecution
  ): Promise<any> {
    // Mock condition evaluation
    const config = step.config || {}
    const conditionResult = config.condition !== false

    return {
      status: 'completed',
      result: conditionResult ? 'success' : 'failure',
      conditionMet: conditionResult
    }
  }

  private async executeParallelStep(
    step: PhaseStep,
    stepExecution: StepExecution,
    execution: PhaseExecution
  ): Promise<any> {
    // Mock parallel execution
    const config = step.config || {}
    const maxConcurrent = parseInt(config['max-concurrent'] || '1')

    return {
      status: 'completed',
      result: 'success',
      parallelExecution: true,
      maxConcurrent
    }
  }

  private async executeSequenceStep(
    step: PhaseStep,
    stepExecution: StepExecution,
    execution: PhaseExecution
  ): Promise<any> {
    // Mock sequence execution
    const config = step.config || {}
    const failFast = config['fail-fast'] === 'true'

    return {
      status: 'completed',
      result: 'success',
      sequentialExecution: true,
      failFast
    }
  }

  private async executeAgent(
    agentConfig: any,
    stepExecution: StepExecution
  ): Promise<AgentExecution> {
    const agentExecution: AgentExecution = {
      id: this.generateId(),
      stepExecutionId: stepExecution.id,
      agentConfig,
      status: 'running',
      input: stepExecution.input,
      startedAt: new Date().toISOString()
    }

    try {
      // Mock agent execution
      await this.simulateDelay(10) // Simulate processing time

      agentExecution.output = {
        result: 'Agent execution completed',
        model: agentConfig.model
      }

      if (agentConfig.outputSchema) {
        agentExecution.structured_output = {
          result: 'Structured output from agent'
        }
      }

      agentExecution.status = 'completed'
      agentExecution.completedAt = new Date().toISOString()
      agentExecution.tokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      }

    } catch (error) {
      agentExecution.status = 'failed'
      agentExecution.error = error instanceof Error ? error.message : 'Unknown error'
      agentExecution.completedAt = new Date().toISOString()
    }

    return agentExecution
  }

  private emitEvent(event: PhaseEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event)
      } catch (error) {
        console.error('Event handler error:', error)
      }
    }
  }

  private generateId(): string {
    return crypto.randomUUID()
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}