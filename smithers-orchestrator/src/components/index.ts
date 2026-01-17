// Smithers Orchestrator Components
// Enhanced components with database integration

export { SmithersProvider, useSmithers } from './SmithersProvider'
export type { SmithersConfig, SmithersContextValue, SmithersProviderProps } from './SmithersProvider'

export { Orchestration } from './Orchestration'
export type { OrchestrationProps, GlobalStopCondition, OrchestrationContext, OrchestrationResult } from './Orchestration'

export { Phase } from './Phase'
export type { PhaseProps } from './Phase'

export { Step } from './Step'
export type { StepProps } from './Step'

// Agent components (will be added by parallel agent)
// export { Claude } from './Claude'
// export type { ClaudeProps } from './Claude'

// Re-export agent types
// export * from './agents/types'
