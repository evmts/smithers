// Simplified transition manager for dynamic phases
import type {
  TransitionManager,
  PhaseExecution,
  PhaseDefinition,
  PhaseTransition,
  PhaseContext,
  TransitionCondition
} from './types.ts'

export class DefaultTransitionManager implements TransitionManager {
  public onEvent?: (event: any) => void

  async evaluateTransitions(
    execution: PhaseExecution,
    stepResult: any,
    phaseDefinition: PhaseDefinition
  ): Promise<string | null> {
    const currentStepId = execution.currentStepId
    if (!currentStepId) return null

    // Find transitions from current step
    for (const transition of phaseDefinition.transitions) {
      if (transition.from === currentStepId) {
        const conditionMet = transition.condition
          ? this.evaluateCondition(transition.condition, stepResult, execution.context)
          : true

        if (conditionMet) {
          return transition.to
        }
      }
    }

    return null
  }

  canTransition(
    fromStepId: string,
    toStepId: string,
    _context: PhaseContext,
    phaseDefinition: PhaseDefinition
  ): boolean {
    return phaseDefinition.transitions.some(
      t => t.from === fromStepId && t.to === toStepId
    )
  }

  async executeTransition(
    _execution: PhaseExecution,
    transition: PhaseTransition
  ): Promise<void> {
    // Mock implementation
    console.log(`Executing transition from ${transition.from} to ${transition.to}`)
  }

  getAvailableTransitions(
    stepId: string,
    _context: PhaseContext,
    phaseDefinition: PhaseDefinition
  ): PhaseTransition[] {
    return phaseDefinition.transitions.filter(t => t.from === stepId)
  }

  evaluateCondition(
    condition: TransitionCondition,
    stepResult: any,
    context: PhaseContext
  ): boolean {
    switch (condition.type) {
      case 'result':
        return stepResult.result === condition.value
      case 'state': {
        const stateKeys = Object.keys(context.state)
        const firstKey = stateKeys[0]
        if (firstKey) {
          return context.state[firstKey] === condition.value
        }
        return false
      }
      default:
        return true
    }
  }
}