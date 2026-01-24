import type {
  WorkflowPhase,
  PhaseExecution,
  PhaseOutput,
  PhaseTransition,
  WorkflowContext,
  TransitionCondition
} from '../types/workflow-types.js'
import { StructuredOutputProcessor } from './structured-output.js'

export class DynamicPhase {
  private definition: WorkflowPhase
  private outputProcessor: StructuredOutputProcessor

  constructor(definition: WorkflowPhase) {
    this.validateDefinition(definition)
    this.definition = definition
    this.outputProcessor = new StructuredOutputProcessor()
  }

  get id(): string {
    return this.definition.id
  }

  get name(): string {
    return this.definition.name
  }

  get type(): string {
    return this.definition.type
  }

  get config(): Record<string, any> {
    return this.definition.config
  }

  get transitions(): PhaseTransition[] {
    return this.definition.transitions
  }

  /**
   * Execute the phase with given input and context
   */
  async execute(
    input: Record<string, any>,
    context: WorkflowContext
  ): Promise<PhaseExecution> {
    const execution: PhaseExecution = {
      id: this.generateExecutionId(),
      phaseId: this.definition.id,
      workflowId: context.execution_id,
      status: 'running',
      startedAt: new Date(),
      input,
      context
    }

    try {
      // Set up timeout if specified
      let timeoutId: NodeJS.Timeout | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        if (this.definition.timeout) {
          timeoutId = setTimeout(() => {
            reject(new Error(`Phase execution timeout after ${this.definition.timeout}ms`))
          }, this.definition.timeout)
        }
      })

      // Execute the phase based on its type
      const executionPromise = this.executePhase(input, context)

      // Race between execution and timeout
      const output = this.definition.timeout
        ? await Promise.race([executionPromise, timeoutPromise])
        : await executionPromise

      // Clear timeout if execution completed
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      execution.output = output
      execution.status = 'completed'
      execution.completedAt = new Date()

    } catch (error) {
      execution.status = error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'failed'
      execution.error = error instanceof Error ? error.message : String(error)
      execution.completedAt = new Date()
    }

    return execution
  }

  /**
   * Evaluate which transitions are valid for the given output
   */
  evaluateTransitions(output: PhaseOutput): PhaseTransition[] {
    const validTransitions: PhaseTransition[] = []

    for (const transition of this.definition.transitions) {
      if (this.evaluateCondition(transition.condition, output)) {
        validTransitions.push(transition)
      }
    }

    // Sort by priority (highest first)
    return validTransitions.sort((a, b) => b.priority - a.priority)
  }

  private async executePhase(
    input: Record<string, any>,
    context: WorkflowContext
  ): Promise<PhaseOutput> {
    switch (this.definition.type) {
      case 'agent-driven':
        return this.executeAgent(input, context)

      case 'script-driven':
        return this.executeScript(input, context)

      case 'manual':
        return this.executeManual(input, context)

      default:
        throw new Error(`Unsupported phase type: ${this.definition.type}`)
    }
  }

  private async executeAgent(
    input: Record<string, any>,
    _context: WorkflowContext
  ): Promise<PhaseOutput> {
    // This would integrate with the Anthropic SDK to execute an agent
    // For now, we'll simulate the execution
    const simulatedResponse = `
      Phase execution completed.

      <structured>
        <status>success</status>
        <processed_input>${JSON.stringify(input)}</processed_input>
        <timestamp>${new Date().toISOString()}</timestamp>
      </structured>

      The agent has processed the input successfully.
    `

    const processed = this.outputProcessor.processPhaseOutput(
      simulatedResponse,
      this.definition.config.outputSchema
    )

    return {
      structured: processed.structured,
      raw: processed.raw,
      metadata: {
        ...processed.metadata,
        model: this.definition.config.model,
        executionType: 'agent'
      }
    }
  }

  private async executeScript(
    _input: Record<string, any>,
    _context: WorkflowContext
  ): Promise<PhaseOutput> {
    // This would execute a script or command
    // For now, we'll simulate the execution
    const result = {
      exitCode: 0,
      stdout: 'Script executed successfully',
      stderr: ''
    }

    return {
      structured: {
        exitCode: result.exitCode,
        success: result.exitCode === 0
      },
      raw: result.stdout,
      metadata: {
        executionType: 'script',
        exitCode: result.exitCode
      }
    }
  }

  private async executeManual(
    _input: Record<string, any>,
    _context: WorkflowContext
  ): Promise<PhaseOutput> {
    // Manual phases require human intervention
    // This would typically wait for user input or approval
    return {
      structured: {
        status: 'pending_manual_input',
        requiresHumanIntervention: true
      },
      raw: 'Manual phase requires human intervention to proceed',
      metadata: {
        executionType: 'manual',
        awaitingInput: true
      }
    }
  }

  private evaluateCondition(
    condition: TransitionCondition,
    output: PhaseOutput
  ): boolean {
    switch (condition.type) {
      case 'always':
        return true

      case 'never':
        return false

      case 'output-contains': {
        const pattern = condition.config['pattern']
        if (!pattern) return false
        return output.raw.includes(pattern)
      }

      case 'structured-field-equals': {
        const field = condition.config['field']
        const expectedValue = condition.config['value']
        if (!field) return false

        const actualValue = this.getNestedValue(output.structured, field)
        return actualValue === expectedValue
      }

      case 'exit-code': {
        const expectedCode = condition.config['code']
        const actualCode = output.structured['exitCode']
        return actualCode === expectedCode
      }

      case 'composite':
        return this.evaluateCompositeCondition(condition, output)

      default:
        console.warn(`Unknown condition type: ${condition.type}`)
        return false
    }
  }

  private evaluateCompositeCondition(
    condition: TransitionCondition,
    output: PhaseOutput
  ): boolean {
    const operator = condition.config['operator'] || 'and'
    const conditions = condition.config['conditions'] || []

    if (conditions.length === 0) return true

    const results = conditions.map((cond: TransitionCondition): boolean =>
      this.evaluateCondition(cond, output)
    )

    switch (operator) {
      case 'and':
        return results.every((result: boolean) => result)

      case 'or':
        return results.some((result: boolean) => result)

      case 'not':
        return !results[0] // Only use first condition for 'not'

      default:
        console.warn(`Unknown composite operator: ${operator}`)
        return false
    }
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined
    }, obj)
  }

  private validateDefinition(definition: WorkflowPhase): void {
    if (!definition.id || definition.id.trim() === '') {
      throw new Error('Phase ID cannot be empty')
    }

    if (!definition.name || definition.name.trim() === '') {
      throw new Error('Phase name cannot be empty')
    }

    if (!['agent-driven', 'script-driven', 'manual'].includes(definition.type)) {
      throw new Error(`Invalid phase type: ${definition.type}`)
    }

    // Validate transitions
    for (const transition of definition.transitions) {
      if (!transition.targetPhase || transition.targetPhase.trim() === '') {
        throw new Error(`Transition ${transition.id} must have a target phase`)
      }

      if (transition.priority < 0 || transition.priority > 1000) {
        throw new Error(`Transition priority must be between 0 and 1000`)
      }
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}