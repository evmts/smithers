/**
 * Workflow module
 *
 * Provides a type-safe reactive input/output system for agent communication.
 *
 * @example
 * ```tsx
 * import { z } from 'zod'
 * import { createWorkflow, Claude, executePlan } from '@evmts/smithers'
 *
 * const workflow = createWorkflow({
 *   schema: z.object({
 *     research: z.string(),
 *     summary: z.string(),
 *   }),
 * })
 *
 * function Researcher() {
 *   return (
 *     <Claude>
 *       Research the topic.
 *       <workflow.Output name="research" description="Your findings" />
 *     </Claude>
 *   )
 * }
 *
 * function Writer() {
 *   const research = workflow.useInput('research')
 *   if (!research) return null
 *
 *   return (
 *     <Claude>
 *       Summarize: {research}
 *       <workflow.Output name="summary" />
 *     </Claude>
 *   )
 * }
 *
 * function App() {
 *   return (
 *     <workflow.Provider>
 *       <Researcher />
 *       <Writer />
 *     </workflow.Provider>
 *   )
 * }
 *
 * await executePlan(<App />)
 * ```
 */

// Main createWorkflow function
export { createWorkflow } from './create-workflow.js'

// Helper functions for execution integration
export { findWorkflowOutputs, zodSchemaToToolSchema, getWorkflowStoreFromTree } from './helpers.js'

// Types
export type {
  Workflow,
  WorkflowStore,
  CreateWorkflowOptions,
  WorkflowOutputProps,
  HumanPromptInfo,
  HumanPromptResponse,
} from './types.js'
