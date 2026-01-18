/**
 * JSX components for Smithers
 */

// Core agent components
export { Claude, type ClaudeProps, type AgentResult, executeClaudeCLI } from './Claude.js'
export { ClaudeApi, type ClaudeApiProps } from './ClaudeApi.js'

// Ralph - Loop controller (backwards compatibility)
export { Ralph, type RalphProps, RalphContext } from './Ralph.js'

// Phase and Step - Workflow structure
export { Phase, type PhaseProps } from './Phase.js'
export { Step, type StepProps } from './Step.js'

// Parallel execution wrapper
export { Parallel, type ParallelProps } from './Parallel.js'

// Phase registry for automatic phase state management
export {
  PhaseRegistryProvider,
  usePhaseRegistry,
  usePhaseIndex,
  type PhaseRegistryContextValue,
  type PhaseRegistryProviderProps
} from './PhaseRegistry.js'

// Step registry for sequential step execution within phases
export { StepRegistryProvider, type StepRegistryProviderProps } from './Step.js'

// Basic workflow components
export { Stop, type StopProps } from './Stop.js'
export { Subagent, type SubagentProps } from './Subagent.js'
export { Persona, type PersonaProps } from './Persona.js'
export { Constraints, type ConstraintsProps } from './Constraints.js'
export { Task, type TaskProps } from './Task.js'
export { Human, type HumanProps } from './Human.js'

// Smithers Provider and Orchestration (database-integrated)
export {
  SmithersProvider,
  useSmithers,
  useRalph,
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
} from './SmithersProvider.js'
export type { SmithersConfig, SmithersContextValue, SmithersProviderProps, RalphContextType } from './SmithersProvider.js'

export { Orchestration } from './Orchestration.js'
export type { OrchestrationProps, GlobalStopCondition, OrchestrationContext, OrchestrationResult } from './Orchestration.js'

// Smithers subagent component
export { Smithers, executeSmithers } from './Smithers.js'
export type { SmithersProps, SmithersResult } from './Smithers.js'

// Agent types
export * from './agents/types.js'

// Git VCS components
export * from './Git/index.js'

// MCP Tool components
export * from './MCP/index.js'

// Review component
export { Review, type ReviewProps, type ReviewTarget, type ReviewResult, type ReviewIssue } from './Review.js'
