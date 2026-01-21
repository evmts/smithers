import { useRef, useMemo } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import { useWorktree } from '../components/WorktreeProvider.js'
import { useExecutionScope } from '../components/ExecutionScope.js'
import { useRalphCount } from './useRalphCount.js'
import { executeCodexCLI } from '../components/agents/codex-cli/index.js'
import type { CodexProps, CodexCLIExecutionOptions } from '../components/agents/types/codex.js'
import type { AgentResult } from '../components/agents/types/execution.js'
import { useMountedState, useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
import { LogWriter } from '../monitor/log-writer.js'
import { uuid } from '../db/utils.js'
import { MessageParser, type TailLogEntry } from '../components/agents/claude-cli/message-parser.js'
import { useQuery, useVersionTracking } from '../reactive-sqlite/index.js'
import { extractText } from '../utils/extract-text.js'
import { composeMiddleware } from '../middleware/compose.js'
import { retryMiddleware } from '../middleware/retry.js'
import { validationMiddleware, ValidationError } from '../middleware/validation.js'
import { createLogger, type Logger } from '../debug/index.js'

const DEFAULT_TAIL_LOG_THROTTLE_MS = 100

type AgentRow = {
  status: string
  result: string | null
  result_structured: string | null
  error: string | null
  tokens_input: number | null
  tokens_output: number | null
  duration_ms: number | null
}

export interface UseCodexResult {
  status: 'pending' | 'running' | 'complete' | 'error'
  agentId: string | null
  executionId: string | null
  model: string
  result: AgentResult | null
  error: Error | null
  tailLog: TailLogEntry[]
}

export function useCodex(props: CodexProps): UseCodexResult {
  const { db, reactiveDb, executionId, isStopRequested, middleware: providerMiddleware, executionEnabled } = useSmithers()
  const worktree = useWorktree()
  const executionScope = useExecutionScope()
  const ralphCount = useRalphCount()
  const cwd = props.cwd ?? worktree?.cwd

  const log: Logger = useMemo(
    () => createLogger('Codex', { model: props.model ?? 'o4-mini' }),
    [props.model]
  )

  const agentIdRef = useRef<string | null>(null)
  const tailLogRef = useRef<TailLogEntry[]>([])
  const { invalidateAndUpdate } = useVersionTracking()
  const { data: agentRows = [] } = useQuery<AgentRow>(
    reactiveDb,
    "SELECT status, result, result_structured, error, tokens_input, tokens_output, duration_ms FROM agents WHERE id = ?",
    [agentIdRef.current ?? '']
  )
  const agentRow = agentRows[0] ?? null

  const dbStatus = agentRow?.status
  const status: 'pending' | 'running' | 'complete' | 'error' = 
    dbStatus === 'completed' ? 'complete' :
    dbStatus === 'failed' ? 'error' :
    dbStatus === 'running' ? 'running' : 'pending'
  
  const result: AgentResult | null = agentRow?.result ? {
    output: agentRow.result,
    structured: agentRow.result_structured ? (() => { try { return JSON.parse(agentRow.result_structured) } catch { return undefined } })() : undefined,
    tokensUsed: {
      input: agentRow.tokens_input ?? 0,
      output: agentRow.tokens_output ?? 0,
    },
    turnsUsed: 0,
    durationMs: agentRow.duration_ms ?? 0,
    stopReason: 'completed',
  } : null
  
  const error: Error | null = agentRow?.error ? new Error(agentRow.error) : null

  const maxEntries = props.tailLogCount ?? 10
  const taskIdRef = useRef<string | null>(null)
  const messageParserRef = useRef<MessageParser>(new MessageParser(maxEntries * 2))
  const isMounted = useMountedState()
  const lastTailLogUpdateRef = useRef<number>(0)
  const pendingTailLogUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shouldExecute = executionEnabled && executionScope.enabled
  const executionKey = shouldExecute ? ralphCount : null

  useUnmount(() => {
    if (pendingTailLogUpdateRef.current) {
      clearTimeout(pendingTailLogUpdateRef.current)
      pendingTailLogUpdateRef.current = null
    }
  })

  useEffectOnValueChange(executionKey, () => {
    if (!shouldExecute) return
    ;(async () => {
      const endTotalTiming = log.time('agent_execution')
      taskIdRef.current = db.tasks.start('codex', props.model ?? 'o4-mini', { scopeId: executionScope.scopeId })

      if (isStopRequested()) {
        log.info('Execution stopped by request')
        db.tasks.complete(taskIdRef.current)
        return
      }

      let currentAgentId: string | null = null

      const logWriter = new LogWriter(undefined, executionId ?? undefined)
      const logId = uuid()
      const logFilename = `agent-${logId}.log`
      let logPath: string | undefined

      log.debug('Starting execution', { logId })

      try {
        const prompt = extractText(props.children)

        const retryOnValidationFailure = props.retryOnValidationFailure === true
        const middlewareStack = [
          ...(providerMiddleware ?? []),
          ...(props.middleware ?? []),
        ]
        const internalMiddlewares = [
          retryMiddleware({
            maxRetries: props.maxRetries ?? 3,
            retryOn: (error) => {
              if (error instanceof ValidationError) {
                return retryOnValidationFailure
              }
              return true
            },
            onRetry: (attempt, error) => {
              const maxRetries = props.maxRetries ?? 3
              const isValidationError = error instanceof ValidationError
              log.warn('Retrying execution', { 
                attempt, 
                maxRetries, 
                isValidationError,
                error: error instanceof Error ? error.message : String(error)
              })
              if (isValidationError) {
                props.onProgress?.(`Validation failed, retrying (${attempt}/${maxRetries})...`)
                return
              }
              props.onProgress?.(`Error occurred, retrying (${attempt}/${maxRetries})...`)
            },
          }),
        ]

        if (props.validate) {
          internalMiddlewares.push(validationMiddleware({ validate: props.validate }))
        }

        const middlewares = [...middlewareStack, ...internalMiddlewares]
        const composed = composeMiddleware(...middlewares)

        const baseOptions: CodexCLIExecutionOptions = {
          prompt,
        }
        if (props.model !== undefined) baseOptions.model = props.model
        if (props.sandboxMode !== undefined) baseOptions.sandboxMode = props.sandboxMode
        if (props.approvalPolicy !== undefined) baseOptions.approvalPolicy = props.approvalPolicy
        if (props.fullAuto !== undefined) baseOptions.fullAuto = props.fullAuto
        if (props.bypassSandbox !== undefined) baseOptions.bypassSandbox = props.bypassSandbox
        if (cwd !== undefined) baseOptions.cwd = cwd
        if (props.skipGitRepoCheck !== undefined) baseOptions.skipGitRepoCheck = props.skipGitRepoCheck
        if (props.addDirs !== undefined) baseOptions.addDirs = props.addDirs
        if (props.images !== undefined) baseOptions.images = props.images
        if (props.profile !== undefined) baseOptions.profile = props.profile
        if (props.configOverrides !== undefined) baseOptions.configOverrides = props.configOverrides
        if (props.timeout !== undefined) baseOptions.timeout = props.timeout
        if (props.stopConditions !== undefined) baseOptions.stopConditions = props.stopConditions
        if (props.jsonOutput !== undefined) baseOptions.json = props.jsonOutput
        if (props.schema !== undefined) baseOptions.schema = props.schema
        if (props.schemaRetries !== undefined) baseOptions.schemaRetries = props.schemaRetries

        const executionOptions = composed.transformOptions
          ? await composed.transformOptions(baseOptions)
          : baseOptions

        if (props.reportingEnabled !== false) {
          logPath = logWriter.appendLog(logFilename, '')

          currentAgentId = await db.agents.start(
            executionOptions.prompt,
            executionOptions.model ?? 'o4-mini',
            undefined,
            logPath
          )
          agentIdRef.current = currentAgentId
          log.info('Agent started', { agentId: currentAgentId, logPath })
        }

        log.debug('Executing CLI', { model: executionOptions.model ?? 'o4-mini' })
        props.onProgress?.(`Starting Codex agent with model: ${executionOptions.model ?? 'o4-mini'}`)

        const handleTailLogUpdate = () => {
          const now = Date.now()
          const timeSinceLastUpdate = now - lastTailLogUpdateRef.current

          if (timeSinceLastUpdate >= DEFAULT_TAIL_LOG_THROTTLE_MS) {
            lastTailLogUpdateRef.current = now
            if (isMounted()) {
              tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
              invalidateAndUpdate()
            }
          } else if (!pendingTailLogUpdateRef.current) {
            pendingTailLogUpdateRef.current = setTimeout(() => {
              pendingTailLogUpdateRef.current = null
              lastTailLogUpdateRef.current = Date.now()
              if (isMounted()) {
                tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
                invalidateAndUpdate()
              }
            }, DEFAULT_TAIL_LOG_THROTTLE_MS - timeSinceLastUpdate)
          }
        }

        const upstreamOnProgress = executionOptions.onProgress
        const onProgress = (chunk: string) => {
          if (logFilename) {
            logWriter.appendLog(logFilename, chunk)
          }

          messageParserRef.current.parseChunk(chunk)
          handleTailLogUpdate()

          upstreamOnProgress?.(chunk)
          props.onProgress?.(chunk)
        }

        const execute = async () => {
          const result = await executeCodexCLI({
            ...executionOptions,
            onProgress,
          })

          if (result.stopReason === 'error') {
            throw new Error(result.output || 'Codex CLI execution failed')
          }

          return result
        }

        const wrappedExecute = composed.wrapExecute
          ? () => composed.wrapExecute!({ doExecute: execute, options: executionOptions })
          : execute

        let agentResult = await wrappedExecute()

        if (composed.transformResult) {
          agentResult = await composed.transformResult(agentResult)
        }

        messageParserRef.current.flush()
        if (pendingTailLogUpdateRef.current) {
          clearTimeout(pendingTailLogUpdateRef.current)
          pendingTailLogUpdateRef.current = null
        }
        tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
        invalidateAndUpdate()

        if (props.reportingEnabled !== false && currentAgentId) {
          await db.agents.complete(
            currentAgentId,
            agentResult.output,
            agentResult.structured,
            agentResult.tokensUsed
          )
        }

        const totalDurationMs = endTotalTiming()
        log.info('Agent completed', { 
          agentId: currentAgentId, 
          tokensInput: agentResult.tokensUsed?.input,
          tokensOutput: agentResult.tokensUsed?.output,
          durationMs: totalDurationMs,
          stopReason: agentResult.stopReason
        })

        if (props.reportingEnabled !== false && agentResult.output) {
          const reportData = {
            type: 'progress' as const,
            title: `Codex ${props.model ?? 'o4-mini'} completed`,
            content: agentResult.output.slice(0, 500),
            data: {
              tokensUsed: agentResult.tokensUsed,
              turnsUsed: agentResult.turnsUsed,
              durationMs: agentResult.durationMs,
            },
          }
          if (currentAgentId) {
            await db.vcs.addReport({
              ...reportData,
              agent_id: currentAgentId,
            })
          } else {
            await db.vcs.addReport(reportData)
          }
        }

        if (isMounted()) {
          props.onFinished?.(agentResult)
        }
      } catch (err) {
        endTotalTiming()
        const errorObj = err instanceof Error ? err : new Error(String(err))
        log.error('Agent execution failed', errorObj, { agentId: currentAgentId })

        if (props.reportingEnabled !== false && currentAgentId) {
          await db.agents.fail(currentAgentId, errorObj.message)
        }

        if (props.reportingEnabled !== false) {
          const errorData = {
            type: 'error' as const,
            title: `Codex ${props.model ?? 'o4-mini'} failed`,
            content: errorObj.message,
            severity: 'warning' as const,
          }
          if (currentAgentId) {
            await db.vcs.addReport({
              ...errorData,
              agent_id: currentAgentId,
            })
          } else {
            await db.vcs.addReport(errorData)
          }
        }

        if (isMounted()) {
          props.onError?.(errorObj)
        }
      } finally {
        await logWriter.flushStream(logFilename)
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })().catch(err => {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      log.error('Unhandled agent execution error', errorObj)
      props.onError?.(errorObj)
    })
  }, [shouldExecute, log])

  return {
    status,
    agentId: agentIdRef.current,
    executionId: executionId ?? null,
    model: props.model ?? 'o4-mini',
    result,
    error,
    tailLog: tailLogRef.current,
  }
}
