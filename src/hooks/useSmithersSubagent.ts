import { useRef, useMemo } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import { useWorktree } from '../components/WorktreeProvider.js'
import { useRalphCount } from './useRalphCount.js'
import { executeSmithers, type SmithersResult } from '../components/agents/SmithersCLI.js'
import type { SmithersProps } from '../components/Smithers.js'
import { useMountedState, useEffectOnValueChange } from '../reconciler/hooks.js'
import { useQueryOne, useQueryValue } from '../reactive-sqlite/index.js'
import { extractText } from '../utils/extract-text.js'
import { useExecutionScope } from '../components/ExecutionScope.js'
import { createLogger, type Logger } from '../debug/index.js'

export interface UseSmithersSubagentResult {
  status: 'pending' | 'planning' | 'executing' | 'complete' | 'error'
  subagentId: string | null
  executionId: string | null
  plannerModel: string
  executionModel: string
  result: SmithersResult | null
  error: Error | null
}

function parseStateValue<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function useSmithersSubagent(props: SmithersProps): UseSmithersSubagentResult {
  const { db, reactiveDb, executionId, isStopRequested } = useSmithers()
  const worktree = useWorktree()
  const executionScope = useExecutionScope()
  const ralphCount = useRalphCount()
  const cwd = props.cwd ?? worktree?.cwd

  const log: Logger = useMemo(
    () => createLogger('Smithers', { plannerModel: props.plannerModel ?? 'sonnet' }),
    [props.plannerModel]
  )

  const subagentInstanceRef = useRef(crypto.randomUUID())
  const subagentKey = `smithers:subagent:${subagentInstanceRef.current}:id`
  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  const { data: subagentIdRaw } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [subagentKey]
  )
  const subagentId = parseStateValue<string | null>(subagentIdRaw, null)

  const agentQuery =
    "SELECT status, result, result_structured, error, tokens_input, tokens_output, duration_ms FROM agents WHERE id = ?"
  const agentParams = [subagentId ?? '__never__']
  const { data: agentRow } = useQueryOne<{
    status: string
    result: string | null
    result_structured: string | null
    error: string | null
    tokens_input: number | null
    tokens_output: number | null
    duration_ms: number | null
  }>(
    reactiveDb,
    agentQuery,
    agentParams
  )
  
  const substatusKey = subagentId ? `smithers:${subagentId}:substatus` : null
  const { data: substatusRaw } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = ?",
    [substatusKey]
  )
  const substatus = parseStateValue<string | null>(substatusRaw, null)
  
  const mapStatus = (): 'pending' | 'planning' | 'executing' | 'complete' | 'error' => {
    if (!agentRow) return 'pending'
    if (agentRow.status === 'completed') return 'complete'
    if (agentRow.status === 'failed') return 'error'
    if (agentRow.status === 'running') {
      if (substatus === 'planning') return 'planning'
      if (substatus === 'executing') return 'executing'
      return 'executing'
    }
    return 'pending'
  }
  
  const status = mapStatus()
  const structuredData = agentRow?.result_structured 
    ? (() => { 
        try { 
          return JSON.parse(agentRow.result_structured) as { 
            script?: string
            scriptPath?: string
            planningResult?: SmithersResult['planningResult']
          } 
        } catch { 
          return null 
        } 
      })()
    : null
  const result: SmithersResult | null = agentRow?.result ? {
    output: agentRow.result,
    script: structuredData?.script ?? '',
    scriptPath: structuredData?.scriptPath ?? '',
    planningResult: structuredData?.planningResult ?? {
      output: '',
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      durationMs: 0,
      stopReason: 'completed' as const,
    },
    tokensUsed: {
      input: agentRow.tokens_input ?? 0,
      output: agentRow.tokens_output ?? 0,
    },
    turnsUsed: 0,
    durationMs: agentRow.duration_ms ?? 0,
    stopReason: 'completed',
  } : null
  const error: Error | null = agentRow?.error ? new Error(agentRow.error) : null

  const setSubstatus = (id: string, value: string) => {
    db.state.set(`smithers:${id}:substatus`, value)
  }

  const executionToken = executionScope.enabled ? ralphCount : null

  useEffectOnValueChange(executionToken, () => {
    if (!executionScope.enabled) return
    ;(async () => {
      const endTotalTiming = log.time('subagent_execution')
      taskIdRef.current = db.tasks.start('smithers', undefined, { scopeId: executionScope.scopeId })

      let activeAgentId: string | null = subagentId

      if (isStopRequested()) {
        log.info('Execution stopped by request')
        db.tasks.complete(taskIdRef.current)
        return
      }

      try {
        const task = extractText(props.children)
        log.debug('Starting subagent', { taskPreview: task.slice(0, 100) })

        if (props.reportingEnabled !== false) {
          const agentId = await db.agents.start(
            `[Smithers Subagent] ${task.slice(0, 100)}...`,
            props.plannerModel ?? 'sonnet',
            'Smithers subagent planning and execution'
          )
          activeAgentId = agentId
          db.state.set(subagentKey, agentId, 'smithers-subagent')
          setSubstatus(agentId, 'planning')
          log.info('Subagent started', { agentId })
        }

        props.onProgress?.('Starting Smithers subagent...')

        if (activeAgentId) {
          setSubstatus(activeAgentId, 'executing')
        }
        const endExecuteTiming = log.time('smithers_cli_execute')
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
        endExecuteTiming()

        if (smithersResult.stopReason === 'error') {
          throw new Error(smithersResult.output || 'Smithers subagent execution failed')
        }

        if (props.reportingEnabled !== false && activeAgentId) {
          await db.agents.complete(
            activeAgentId,
            smithersResult.output,
            { 
              script: smithersResult.script, 
              scriptPath: smithersResult.scriptPath,
              planningResult: smithersResult.planningResult,
            },
            smithersResult.tokensUsed
          )
        }

        if (!isMounted()) {
          return
        }

        const totalDurationMs = endTotalTiming()
        log.info('Subagent completed', { 
          agentId: activeAgentId,
          tokensInput: smithersResult.tokensUsed?.input,
          tokensOutput: smithersResult.tokensUsed?.output,
          durationMs: totalDurationMs,
          scriptPath: smithersResult.scriptPath
        })

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
            ...(activeAgentId ? { agent_id: activeAgentId } : {}),
          })
        }

        if (isMounted()) {
          props.onFinished?.(smithersResult)
        }

      } catch (err) {
        endTotalTiming()
        const errorObj = err instanceof Error ? err : new Error(String(err))
        const rootCause = errorObj.cause instanceof Error ? errorObj.cause : errorObj
        const errorMessage = rootCause.message
        log.error('Subagent execution failed', errorObj, { agentId: activeAgentId })

        if (props.reportingEnabled !== false && activeAgentId) {
          await db.agents.fail(activeAgentId, errorMessage)
        }

        if (props.reportingEnabled !== false) {
          await db.vcs.addReport({
            type: 'error',
            title: 'Smithers subagent failed',
            content: errorMessage,
            severity: 'warning',
            ...(activeAgentId ? { agent_id: activeAgentId } : {}),
          })
        }

        if (isMounted()) {
          props.onError?.(errorObj)
        }
      } finally {
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })().catch(err => {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      log.error('Unhandled subagent execution error', errorObj)
      if (isMounted()) {
        props.onError?.(errorObj)
      }
    })
  }, [executionScope.enabled, ralphCount, log])

  return {
    status,
    subagentId,
    executionId: executionId ?? null,
    plannerModel: props.plannerModel ?? 'sonnet',
    executionModel: props.executionModel ?? 'sonnet',
    result,
    error,
  }
}
