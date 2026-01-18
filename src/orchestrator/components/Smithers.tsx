// Smithers Subagent Component
// Launches a new Smithers instance to plan and execute a task

import { useState, useEffect, useContext, type ReactNode } from 'react'
import { RalphContext } from '../../components/Ralph'
import { useSmithers } from './SmithersProvider'
import { executeSmithers, type SmithersResult } from './agents/SmithersCLI'
import type { ClaudeModel } from './agents/types'

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Component
// ============================================================================

/**
 * Smithers Subagent Component
 *
 * Launches a new Smithers instance to plan and execute a complex task.
 * Uses Claude to generate a Smithers script based on the task description,
 * then executes that script as a subprocess.
 *
 * @example
 * ```tsx
 * <Smithers
 *   plannerModel="opus"
 *   executionModel="sonnet"
 *   onFinished={(result) => console.log('Task completed:', result.output)}
 * >
 *   Create a new API endpoint for user authentication.
 *   The endpoint should:
 *   1. Accept POST requests with email and password
 *   2. Validate credentials against the database
 *   3. Return a JWT token on success
 *   4. Include proper error handling and tests
 * </Smithers>
 * ```
 */
export function Smithers(props: SmithersProps): ReactNode {
  const { db, executionId } = useSmithers()
  const ralph = useContext(RalphContext)

  const [status, setStatus] = useState<'pending' | 'planning' | 'executing' | 'complete' | 'error'>('pending')
  const [result, setResult] = useState<SmithersResult | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [subagentId, setSubagentId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Fire-and-forget async IIFE
    ;(async () => {
      ralph?.registerTask()

      let currentSubagentId: string | null = null

      try {
        if (!cancelled) setStatus('planning')

        // Extract task from children
        const task = String(props.children)

        // Log subagent start to database
        if (props.reportingEnabled !== false) {
          currentSubagentId = await db.agents.start(
            `[Smithers Subagent] ${task.slice(0, 100)}...`,
            props.plannerModel ?? 'sonnet',
            'Smithers subagent planning and execution'
          )
          if (!cancelled) setSubagentId(currentSubagentId)
        }

        props.onProgress?.('Starting Smithers subagent...')

        // Execute the subagent
        if (!cancelled) setStatus('executing')
        const smithersResult = await executeSmithers({
          task,
          plannerModel: props.plannerModel,
          executionModel: props.executionModel,
          maxPlanningTurns: props.maxPlanningTurns,
          timeout: props.timeout,
          context: props.context,
          cwd: props.cwd,
          keepScript: props.keepScript || !!props.scriptPath,
          scriptPath: props.scriptPath,
          onProgress: props.onProgress,
          onScriptGenerated: props.onScriptGenerated,
        })

        // Check for errors
        if (smithersResult.stopReason === 'error') {
          throw new Error(smithersResult.output || 'Smithers subagent execution failed')
        }

        // Log completion to database
        if (props.reportingEnabled !== false && currentSubagentId) {
          await db.agents.complete(
            currentSubagentId,
            smithersResult.output,
            { script: smithersResult.script, scriptPath: smithersResult.scriptPath },
            smithersResult.tokensUsed
          )
        }

        // Add report
        if (props.reportingEnabled !== false) {
          await db.vcs.addReport({
            type: 'progress',
            title: 'Smithers subagent completed',
            content: smithersResult.output.slice(0, 500),
            data: {
              tokensUsed: smithersResult.tokensUsed,
              scriptPath: smithersResult.scriptPath,
              durationMs: smithersResult.durationMs,
            },
            agent_id: currentSubagentId ?? undefined,
          })
        }

        if (!cancelled) {
          setResult(smithersResult)
          setStatus('complete')
          props.onFinished?.(smithersResult)
        }

      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        if (!cancelled) {
          setError(errorObj)
          setStatus('error')
        }

        // Log failure to database
        if (props.reportingEnabled !== false && currentSubagentId) {
          await db.agents.fail(currentSubagentId, errorObj.message)
        }

        // Add error report
        if (props.reportingEnabled !== false) {
          await db.vcs.addReport({
            type: 'error',
            title: 'Smithers subagent failed',
            content: errorObj.message,
            severity: 'warning',
            agent_id: currentSubagentId ?? undefined,
          })
        }

        props.onError?.(errorObj)
      } finally {
        ralph?.completeTask()
      }
    })()

    return () => { cancelled = true }
  }, [])

  // Render custom element for XML serialization
  return (
    <smithers-subagent
      status={status}
      subagent-id={subagentId}
      execution-id={executionId}
      planner-model={props.plannerModel ?? 'sonnet'}
      execution-model={props.executionModel ?? 'sonnet'}
      script-path={result?.scriptPath}
      output={result?.output?.slice(0, 200)}
      error={error?.message}
      tokens-input={result?.tokensUsed?.input}
      tokens-output={result?.tokensUsed?.output}
      duration-ms={result?.durationMs}
    >
      {props.children}
    </smithers-subagent>
  )
}

// ============================================================================
// Exports
// ============================================================================

export type { SmithersResult }
export { executeSmithers } from './agents/SmithersCLI'
