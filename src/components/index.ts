/**
 * JSX components for Smithers
 */

// Core agent components
export { Claude, type ClaudeProps, type AgentResult, executeClaudeCLI } from './Claude'
export { ClaudeApi, type ClaudeApiProps } from './ClaudeApi'

// Ralph - Loop controller (backwards compatibility)
export { Ralph, type RalphProps, RalphContext } from './Ralph'

// Phase and Step - Workflow structure
export { Phase, type PhaseProps } from './Phase'
export { Step, type StepProps } from './Step'

// Basic workflow components
export { Stop, type StopProps } from './Stop'
export { Subagent, type SubagentProps } from './Subagent'
export { Persona, type PersonaProps } from './Persona'
export { Constraints, type ConstraintsProps } from './Constraints'
export { Task, type TaskProps } from './Task'
export { Human, type HumanProps } from './Human'

// Smithers Provider and Orchestration (database-integrated)
export {
  SmithersProvider,
  useSmithers,
  useRalph,
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
} from './SmithersProvider'
export type { SmithersConfig, SmithersContextValue, SmithersProviderProps, RalphContextType } from './SmithersProvider'

export { Orchestration } from './Orchestration'
export type { OrchestrationProps, GlobalStopCondition, OrchestrationContext, OrchestrationResult } from './Orchestration'

// Smithers subagent component
export { Smithers, executeSmithers } from './Smithers'
export type { SmithersProps, SmithersResult } from './Smithers'

// Agent types
export * from './agents/types'

// Git VCS components
export * from './Git/index'

// MCP Tool components
export * from './MCP/index'

// Review component
export { Review, type ReviewProps, type ReviewTarget, type ReviewResult, type ReviewIssue } from './Review'
