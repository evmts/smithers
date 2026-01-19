import { useRef, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useWorktree } from './WorktreeProvider.js'
import { useExecutionScope } from './ExecutionScope.js'
import { useRalphCount } from '../hooks/useRalphCount.js'
import { executeAmpCLI } from './agents/amp-cli/executor.js'
import type { AmpProps, AmpCLIExecutionOptions } from './agents/types/amp.js'
import type { AgentResult } from './agents/types/execution.js'
import { useMountedState, useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
import { LogWriter } from '../monitor/log-writer.js'
import { uuid } from '../db/utils.js'
import { truncateToLastLines, type TailLogEntry } from './agents/claude-cli/message-parser.js'
import { AmpMessageParser } from './agents/amp-cli/output-parser.js'
import { AmpStreamParser } from '../streaming/amp-parser.js'
import type { SmithersStreamPart } from '../streaming/types.js'
import type { StreamSummary } from '../db/types.js'
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

/**
 * Amp Agent Component
 *
 * Executes Amp CLI as a React component with database tracking,
 * progress reporting, and retry logic.
 *
 * @example
 * ```tsx
 * <Amp mode="smart" onFinished={(result) => console.log(result.output)}>
 *   Fix the bug in src/utils.ts
 * </Amp>
 * ```
 */
export function Amp(props: AmpProps): ReactNode {
  const { db, reactiveDb, executionId, isStopRequested, middleware: providerMiddleware, executionEnabled } = useSmithers()
  const worktree = useWorktree()
  const executionScope = useExecutionScope()
  const ralphCount = useRalphCount()
  const cwd = props.cwd ?? worktree?.cwd

  const log: Logger = useMemo(
    () => createLogger('Amp', { mode: props.mode ?? 'smart' }),
    [props.mode]
  )

  const agentIdRef = useRef<string | null>(null)
  const tailLogRef = useRef<TailLogEntry[]>([])
  const { invalidateAndUpdate } = useVersionTracking()
  const { data: agentRows } = useQuery<AgentRow>(
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
  const messageParserRef = useRef<AmpMessageParser>(new AmpMessageParser(maxEntries * 2))
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
      taskIdRef.current = db.tasks.start('amp', props.mode ?? 'smart', { scopeId: executionScope.scopeId })

      if (isStopRequested()) {
        log.info('Execution stopped by request')
        db.tasks.complete(taskIdRef.current)
        return
      }

      let currentAgentId: string | null = null

      const logWriter = new LogWriter(undefined, executionId ?? undefined)
      const logId = uuid()
      const typedStreamingEnabled = props.experimentalTypedStreaming === true || props.onStreamPart !== undefined
      const useLegacyLogFormat = typedStreamingEnabled && (props.legacyLogFormat ?? false)
      const recordStreamEvents = props.recordStreamEvents ?? props.reportingEnabled !== false
      const streamLogFilename = typedStreamingEnabled ? `agent-${logId}.ndjson` : `agent-${logId}.log`
      const legacyLogFilename = useLegacyLogFormat ? `agent-${logId}.log.legacy.txt` : null
      const streamParser = new AmpStreamParser()
      const streamSummary: StreamSummary = {
        textBlocks: 0,
        reasoningBlocks: 0,
        toolCalls: 0,
        toolResults: 0,
        errors: 0,
      }
      const logFilename = streamLogFilename
      let logPath: string | undefined

      log.debug('Starting execution', { logId })

      try {
        const childrenString = extractText(props.children)
        const prompt = childrenString

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

        const baseOptions: AmpCLIExecutionOptions = {
          prompt,
        }
        if (props.mode !== undefined) baseOptions.mode = props.mode
        if (props.permissionMode !== undefined) baseOptions.permissionMode = props.permissionMode
        if (props.maxTurns !== undefined) baseOptions.maxTurns = props.maxTurns
        if (props.systemPrompt !== undefined) baseOptions.systemPrompt = props.systemPrompt
        if (cwd !== undefined) baseOptions.cwd = cwd
        if (props.timeout !== undefined) baseOptions.timeout = props.timeout
        if (props.stopConditions !== undefined) baseOptions.stopConditions = props.stopConditions
        if (props.continueThread !== undefined) baseOptions.continue = props.continueThread
        if (props.resumeThread !== undefined) baseOptions.resume = props.resumeThread
        if (props.labels !== undefined) baseOptions.labels = props.labels
        if (props.onToolCall !== undefined) baseOptions.onToolCall = props.onToolCall

        const executionOptions: AmpCLIExecutionOptions = composed.transformOptions
          ? await composed.transformOptions(baseOptions) as AmpCLIExecutionOptions
          : baseOptions

        if (props.reportingEnabled !== false) {
          logPath = logWriter.appendLog(logFilename, '')
          if (legacyLogFilename) {
            logWriter.appendLog(legacyLogFilename, '')
          }

          currentAgentId = await db.agents.start(
            executionOptions.prompt,
            `amp-${executionOptions.mode ?? 'smart'}`,
            executionOptions.systemPrompt,
            logPath
          )
          agentIdRef.current = currentAgentId
          log.info('Agent started', { agentId: currentAgentId, logPath })
        }

        log.debug('Executing CLI', { mode: executionOptions.mode ?? 'smart' })
        props.onProgress?.(`Starting Amp agent with mode: ${executionOptions.mode ?? 'smart'}`)

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

        const handleStreamPart = (part: SmithersStreamPart) => {
          if (typedStreamingEnabled) {
            logWriter.appendStreamPart(logFilename, part)

            if (recordStreamEvents && currentAgentId) {
              db.agents.recordStreamEvent(currentAgentId, part)
            }

            if (part.type === 'text-end') {
              streamSummary.textBlocks += 1
            } else if (part.type === 'reasoning-end') {
              streamSummary.reasoningBlocks += 1
            } else if (part.type === 'tool-call') {
              streamSummary.toolCalls += 1
            } else if (part.type === 'tool-result') {
              streamSummary.toolResults += 1
            } else if (part.type === 'error') {
              streamSummary.errors += 1
            }

            props.onStreamPart?.(part)
          }

        }

        const upstreamOnProgress = executionOptions.onProgress
        const onProgress = (chunk: string) => {
          messageParserRef.current.parseChunk(chunk)
          handleTailLogUpdate()

          if (typedStreamingEnabled) {
            if (legacyLogFilename) {
              logWriter.appendLog(legacyLogFilename, chunk)
            }
            const parts = streamParser.parse(chunk)
            for (const part of parts) {
              handleStreamPart(part)
            }
            return
          }

          if (logFilename) {
            logWriter.appendLog(logFilename, chunk)
          }

          const parts = streamParser.parse(chunk)
          for (const part of parts) {
            handleStreamPart(part)
          }

          const transformedChunk = composed.transformChunk
            ? composed.transformChunk(chunk)
            : chunk

          upstreamOnProgress?.(transformedChunk)
          props.onProgress?.(transformedChunk)
        }

        const execute = async () => {
          const result = await executeAmpCLI({
            ...executionOptions,
            onProgress,
          })

          if (result.stopReason === 'error') {
            throw new Error(result.output || 'Amp CLI execution failed')
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

        const remainingParts = streamParser.flush()
        for (const part of remainingParts) {
          handleStreamPart(part)
        }
        if (typedStreamingEnabled && agentResult.sessionId) {
          handleStreamPart({
            type: 'session-info',
            sessionId: agentResult.sessionId,
            model: props.mode ?? 'smart',
          })
        }
        if (typedStreamingEnabled && props.reportingEnabled !== false && currentAgentId) {
          db.agents.setStreamSummary(currentAgentId, streamSummary)
          logWriter.writeStreamSummaryFromCounts(logFilename, streamSummary)
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
            title: `Amp ${props.mode ?? 'smart'} completed`,
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
            title: `Amp ${props.mode ?? 'smart'} failed`,
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
        if (legacyLogFilename) {
          await logWriter.flushStream(legacyLogFilename)
        }
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

  const maxLines = props.tailLogLines ?? 10
  const tailLog = tailLogRef.current
  const displayEntries = status === 'complete'
    ? tailLog.slice(-1)
    : tailLog.slice(-maxEntries)

  return (
    <amp
      status={status}
      agentId={agentIdRef.current}
      executionId={executionId}
      mode={props.mode ?? 'smart'}
      {...(error?.message ? { error: error.message } : {})}
      {...(result?.tokensUsed?.input !== undefined ? { tokensInput: result.tokensUsed.input } : {})}
      {...(result?.tokensUsed?.output !== undefined ? { tokensOutput: result.tokensUsed.output } : {})}
      {...(result?.turnsUsed !== undefined ? { turnsUsed: result.turnsUsed } : {})}
      {...(result?.durationMs !== undefined ? { durationMs: result.durationMs } : {})}
    >
      {displayEntries.length > 0 && (
        <messages count={displayEntries.length}>
          {displayEntries.map(entry =>
            entry.type === 'message' ? (
              <message key={entry.index} index={entry.index}>
                {truncateToLastLines(entry.content, maxLines)}
              </message>
            ) : (
              <tool-call key={entry.index} name={entry.toolName} index={entry.index}>
                {truncateToLastLines(entry.content, maxLines)}
              </tool-call>
            )
          )}
        </messages>
      )}
      {props.children}
    </amp>
  )
}

export type { AmpProps }
export { executeAmpCLI } from './agents/amp-cli/executor.js'
