// Smithers Subagent Component
// Launches a new Smithers instance to plan and execute a task

import { useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useWorktree } from './WorktreeProvider.js'
import { usePhaseContext } from './PhaseContext.js'
import { useStepContext } from './StepContext.js'
import { useRalphCount } from '../hooks/useRalphCount.js'
import { executeSmithers, type SmithersResult } from './agents/SmithersCLI.js'
import type { ClaudeModel } from './agents/types.js'
import { useMountedState, useEffectOnValueChange } from '../reconciler/hooks.js'
import { useQueryOne, useQueryValue } from '../reactive-sqlite/index.js'
import { extractText } from '../utils/extract-text.js'

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
  const { db, reactiveDb, executionId, isStopRequested } = useSmithers()
  const worktree = useWorktree()
  const phase = usePhaseContext()
  const phaseActive = phase?.isActive ?? true
  const step = useStepContext()
  const stepActive = step?.isActive ?? true
  const ralphCount = useRalphCount()
  const cwd = props.cwd ?? worktree?.cwd

  const subagentIdRef = useRef<string | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  // Query reactive state from DB
  const { data: agentRow } = useQueryOne<{status: string, result: string | null, result_structured: string | null, error: string | null}>(
    reactiveDb,
    "SELECT status, result, result_structured, error FROM agents WHERE id = ?",
    [subagentIdRef.current]
  )
  
  // Sub-status for planning/executing (stored in state table since agents table only has pending/running/completed/failed)
  const substatusKey = subagentIdRef.current ? `smithers:${subagentIdRef.current}:substatus` : null
  const { data: substatus } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [substatusKey]
  )
  
  // Map DB status to component status
  const mapStatus = (): 'pending' | 'planning' | 'executing' | 'complete' | 'error' => {
    if (!agentRow) return 'pending'
    if (agentRow.status === 'completed') return 'complete'
    if (agentRow.status === 'failed') return 'error'
    if (agentRow.status === 'running') {
      // Use substatus if available
      if (substatus === 'planning') return 'planning'
      if (substatus === 'executing') return 'executing'
      return 'executing' // default for running
    }
    return 'pending'
  }
  
  const status = mapStatus()
  const result: SmithersResult | null = agentRow?.result_structured 
    ? (() => { try { return JSON.parse(agentRow.result_structured) } catch { return null } })()
    : null
  const error: Error | null = agentRow?.error ? new Error(agentRow.error) : null

  // Helper to set substatus in DB
  const setSubstatus = (id: string, value: string) => {
    db.state.set(`smithers:${id}:substatus`, value)
  }

  // Execute once per ralphCount change (idempotent, handles React strict mode)
  const shouldExecute = phaseActive && stepActive
  const executionKey = `${ralphCount}:${shouldExecute ? 'active' : 'inactive'}`

  useEffectOnValueChange(executionKey, () => {
    if (!shouldExecute) return
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = db.tasks.start('smithers')

      if (isStopRequested()) {
        db.tasks.complete(taskIdRef.current)
        return
      }

      try {
        // Extract task from children
        const task = extractText(props.children)

        // Log subagent start to database
        if (props.reportingEnabled !== false) {
          const agentId = await db.agents.start(
            `[Smithers Subagent] ${task.slice(0, 100)}...`,
            props.plannerModel ?? 'sonnet',
            'Smithers subagent planning and execution'
          )
          subagentIdRef.current = agentId
          setSubstatus(agentId, 'planning')
        }

        props.onProgress?.('Starting Smithers subagent...')

        // Execute the subagent
        if (subagentIdRef.current) {
          setSubstatus(subagentIdRef.current, 'executing')
        }
        const smithersResult = await executeSmithers({
          task,
          ...(props.plannerModel !== undefined ? { plannerModel: props.plannerModel } : {}),
          ...(props.executionModel !== undefined ? { executionModel: props.executionModel } : {}),
          ...(props.maxPlanningTurns !== undefined ? { maxPlanningTurns: props.maxPlanningTurns } : {}),
          ...(props.timeout !== undefined ? { timeout: props.timeout } : {}),
          ...(props.context !== undefined ? { context: props.context } : {}),
          ...(cwd !== undefined ? { cwd } : {}),
          keepScript: props.keepScript || !!props.scriptPath,
          ...(props.scriptPath !== undefined ? { scriptPath: props.scriptPath } : {}),
          ...(props.onProgress !== undefined ? { onProgress: props.onProgress } : {}),
          ...(props.onScriptGenerated !== undefined ? { onScriptGenerated: props.onScriptGenerated } : {}),
        })

        // Check for errors
        if (smithersResult.stopReason === 'error') {
          throw new Error(smithersResult.output || 'Smithers subagent execution failed')
        }

        // Log completion to database (this also sets status to 'completed')
        if (props.reportingEnabled !== false && subagentIdRef.current) {
          await db.agents.complete(
            subagentIdRef.current,
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
            ...(subagentIdRef.current ? { agent_id: subagentIdRef.current } : {}),
          })
        }

        if (isMounted()) {
          props.onFinished?.(smithersResult)
        }

      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))

        // Log failure to database (this also sets status to 'failed')
        if (props.reportingEnabled !== false && subagentIdRef.current) {
          await db.agents.fail(subagentIdRef.current, errorObj.message)
        }

        // Add error report
        if (props.reportingEnabled !== false) {
          await db.vcs.addReport({
            type: 'error',
            title: 'Smithers subagent failed',
            content: errorObj.message,
            severity: 'warning',
            ...(subagentIdRef.current ? { agent_id: subagentIdRef.current } : {}),
          })
        }

        if (isMounted()) {
          props.onError?.(errorObj)
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })().catch(err => {
      console.error('Agent execution failed:', err)
      if (isMounted()) {
        props.onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    })
  })

  // Render custom element for XML serialization
  return (
    <smithers-subagent
      status={status}
      {...(subagentIdRef.current ? { 'subagent-id': subagentIdRef.current } : {})}
      {...(executionId ? { 'execution-id': executionId } : {})}
      planner-model={props.plannerModel ?? 'sonnet'}
      execution-model={props.executionModel ?? 'sonnet'}
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

// ============================================================================
// Exports
// ============================================================================

export type { SmithersResult }
export { executeSmithers } from './agents/SmithersCLI.js'
