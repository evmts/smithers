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
export { PhaseContext, usePhaseContext, type PhaseContextValue } from './PhaseContext.js'
export { StepContext, useStepContext, type StepContextValue } from './StepContext.js'
export { ExecutionScopeProvider, useExecutionScope, useExecutionEffect } from './ExecutionScope.js'

// Parallel execution wrapper
export { Parallel, type ParallelProps } from './Parallel.js'

// Worktree execution context
export { Worktree, type WorktreeProps } from './Worktree.js'
export { useWorktree, WorktreeProvider, type WorktreeContextValue } from './WorktreeProvider.js'

// Phase registry for automatic phase state management
export {
  PhaseRegistryProvider,
  usePhaseRegistry,
  usePhaseIndex,
  type PhaseRegistryContextValue,
  type PhaseRegistryProviderProps
} from './PhaseRegistry.js'

// Step registry for sequential step execution within phases
export {
  StepRegistryProvider,
  useStepRegistry,
  useStepIndex,
  type StepRegistryProviderProps
} from './Step.js'

// Basic workflow components
export { Each, type EachProps } from './Each.js'
export { If, type IfProps } from './If.js'
export { While, useWhileIteration, type WhileProps, type WhileIterationContextValue } from './While.js'
export { Stop, type StopProps } from './Stop.js'
export { End, type EndProps, type EndSummary } from './End.js'
export { Subagent, type SubagentProps } from './Subagent.js'
export { Persona, type PersonaProps } from './Persona.js'
export { Constraints, type ConstraintsProps } from './Constraints.js'
export { Task, type TaskProps } from './Task.js'
export { Human, type HumanProps } from './Human.js'

// Smithers Provider (database-integrated, includes orchestration)
export {
  SmithersProvider,
  ExecutionBoundary,
  useSmithers,
  useRalph,
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
  signalOrchestrationCompleteByToken,
  signalOrchestrationErrorByToken,
  setActiveOrchestrationToken,
  useOrchestrationToken,
} from './SmithersProvider.js'
export type {
  SmithersConfig,
  SmithersContextValue,
  SmithersProviderProps,
  RalphContextType,
  GlobalStopCondition,
  OrchestrationContext,
  OrchestrationResult,
} from './SmithersProvider.js'

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
