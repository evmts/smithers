import type { ReactNode } from 'react'
import { useSmithersSubagent } from '../hooks/useSmithersSubagent.js'
import type { SmithersResult } from './agents/SmithersCLI.js'
import type { ClaudeModel } from './agents/types.js'

export interface SmithersProps {
  /**
   * Task description (as children)
   */
  children: ReactNode

  /**
   * Model to use for planning the script
   * @default 'sonnet'
   */
  plannerModel?: ClaudeModel

  /**
   * Model to use within the generated script for Claude agents
   * @default 'sonnet'
   */
  executionModel?: ClaudeModel

  /**
   * Maximum turns for the planning phase
   * @default 5
   */
  maxPlanningTurns?: number

  /**
   * Timeout in milliseconds for the entire execution
   * @default 600000 (10 minutes)
   */
  timeout?: number

  /**
   * Additional context to provide to the planner
   */
  context?: string

  /**
   * Working directory for script execution
   */
  cwd?: string

  /**
   * Keep the generated script after execution
   * @default false
   */
  keepScript?: boolean

  /**
   * Custom path for the generated script (implies keepScript)
   */
  scriptPath?: string

  /**
   * Enable database reporting for this subagent
   * @default true
   */
  reportingEnabled?: boolean

  /**
   * Called when the subagent finishes successfully
   */
  onFinished?: (result: SmithersResult) => void

  /**
   * Called when the subagent encounters an error
   */
  onError?: (error: Error) => void

  /**
   * Called for progress updates
   */
  onProgress?: (message: string) => void

  /**
   * Called when the script is generated (before execution)
   */
  onScriptGenerated?: (script: string, path: string) => void
}

export function Smithers(props: SmithersProps): ReactNode {
  const { status, subagentId, executionId, plannerModel, executionModel, result, error } = useSmithersSubagent(props)

  return (
    <smithers-subagent
      status={status}
      {...(subagentId ? { 'subagent-id': subagentId } : {})}
      {...(executionId ? { 'execution-id': executionId } : {})}
      planner-model={plannerModel}
      execution-model={executionModel}
      {...(result?.scriptPath ? { 'script-path': result.scriptPath } : {})}
      {...(result?.output ? { output: result.output.slice(0, 200) } : {})}
      {...(error?.message ? { error: error.message } : {})}
      {...(result?.tokensUsed?.input !== undefined ? { 'tokens-input': result.tokensUsed.input } : {})}
      {...(result?.tokensUsed?.output !== undefined ? { 'tokens-output': result.tokensUsed.output } : {})}
      {...(result?.durationMs !== undefined ? { 'duration-ms': result.durationMs } : {})}
    >
      {props.children}
    </smithers-subagent>
  )
}

export type { SmithersResult }
export { executeSmithers } from './agents/SmithersCLI.js'
