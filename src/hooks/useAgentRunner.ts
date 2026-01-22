// Unified agent runner hook - shared execution logic for Claude, Amp, and Codex hooks
import { useRef, useMemo } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import { useWorktree } from '../components/WorktreeProvider.js'
import { useExecutionScope } from '../components/ExecutionScope.js'
import { useRalphCount } from './useRalphCount.js'
import { useMountedState, useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
import { LogWriter } from '../monitor/log-writer.js'
import { uuid } from '../db/utils.js'
import { useQuery, useVersionTracking } from '../reactive-sqlite/index.js'
import { extractText } from '../utils/extract-text.js'
import { composeMiddleware } from '../middleware/compose.js'
import { retryMiddleware } from '../middleware/retry.js'
import { validationMiddleware, ValidationError } from '../middleware/validation.js'
import { createLogger, type Logger } from '../debug/index.js'
import type { AgentAdapter, MessageParserInterface, StreamParserInterface } from './adapters/types.js'
import type { AgentResult } from '../components/agents/types/execution.js'
import type { SmithersStreamPart } from '../streaming/types.js'
import type { StreamSummary } from '../db/types.js'
import type { TailLogEntry } from '../components/agents/claude-cli/message-parser.js'
import type { SmithersMiddleware } from '../middleware/types.js'

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

export interface BaseAgentHookProps {
  children?: React.ReactNode
  cwd?: string
  onFinished?: (result: AgentResult) => void
  onError?: (error: Error) => void
  onProgress?: (message: string) => void
  onStreamPart?: (part: SmithersStreamPart) => void
  onToolCall?: (tool: string, input: unknown) => void
  reportingEnabled?: boolean
  validate?: (result: AgentResult) => boolean | Promise<boolean>
  retryOnValidationFailure?: boolean
  maxRetries?: number
  /** Base delay in milliseconds for retry backoff. @default 250 */
  retryDelayMs?: number
  tailLogCount?: number
  middleware?: SmithersMiddleware[]
  recordStreamEvents?: boolean
  legacyLogFormat?: boolean
}

export interface UseAgentResult {
  status: 'pending' | 'running' | 'complete' | 'error'
  agentId: string | null
  executionId: string | null
  result: AgentResult | null
  error: Error | null
  tailLog: TailLogEntry[]
}

export function useAgentRunner<TProps extends BaseAgentHookProps, TOptions>(
  props: TProps,
  adapter: AgentAdapter<TProps, TOptions>
): UseAgentResult {
  const { db, reactiveDb, executionId, isStopRequested, middleware: providerMiddleware, executionEnabled } = useSmithers()
  const worktree = useWorktree()
  const executionScope = useExecutionScope()
  const ralphCount = useRalphCount()
  const cwd = props.cwd ?? worktree?.cwd
  const log: Logger = useMemo(() => createLogger(adapter.getLoggerName(), adapter.getLoggerContext(props)), [adapter, props])
  const agentIdRef = useRef<string | null>(null)
  const tailLogRef = useRef<TailLogEntry[]>([])
  const { invalidateAndUpdate } = useVersionTracking()
  const { data: agentRows = [] } = useQuery<AgentRow>(reactiveDb, "SELECT status, result, result_structured, error, tokens_input, tokens_output, duration_ms FROM agents WHERE id = ?", [agentIdRef.current ?? ''])
  const agentRow = agentRows[0] ?? null
  const dbStatus = agentRow?.status
  const status: 'pending' | 'running' | 'complete' | 'error' = dbStatus === 'completed' ? 'complete' : dbStatus === 'failed' ? 'error' : dbStatus === 'running' ? 'running' : 'pending'
  const result: AgentResult | null = agentRow?.result ? { output: agentRow.result, structured: agentRow.result_structured ? (() => { try { return JSON.parse(agentRow.result_structured) } catch { return undefined } })() : undefined, tokensUsed: { input: agentRow.tokens_input ?? 0, output: agentRow.tokens_output ?? 0 }, turnsUsed: 0, durationMs: agentRow.duration_ms ?? 0, stopReason: 'completed' } : null
  const error: Error | null = agentRow?.error ? new Error(agentRow.error) : null
  const maxEntries = props.tailLogCount ?? 10
  const taskIdRef = useRef<string | null>(null)
  const messageParserRef = useRef<MessageParserInterface | null>(null)
  const isMounted = useMountedState()
  const lastTailLogUpdateRef = useRef<number>(0)
  const pendingTailLogUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldExecute = executionEnabled && executionScope.enabled
  const executionKey = shouldExecute ? ralphCount : null

  useUnmount(() => { if (pendingTailLogUpdateRef.current) { clearTimeout(pendingTailLogUpdateRef.current); pendingTailLogUpdateRef.current = null } })

  useEffectOnValueChange(executionKey, () => {
    if (!shouldExecute) return
    ;(async () => {
      const endTotalTiming = log.time('agent_execution')
      taskIdRef.current = db.tasks.start(adapter.name, '', { scopeId: executionScope.scopeId })
      if (isStopRequested()) { log.info('Execution stopped by request'); db.tasks.complete(taskIdRef.current); return }
      let currentAgentId: string | null = null
      const logWriter = new LogWriter(undefined, executionId ?? undefined)
      const logId = uuid()
      const typedStreamingEnabled = adapter.supportsTypedStreaming(props)
      const baseProps = props as BaseAgentHookProps
      const recordStreamEvents = baseProps.recordStreamEvents ?? baseProps.reportingEnabled !== false
      const legacyLogFormat = baseProps.legacyLogFormat ?? false
      const streamLogFilename = typedStreamingEnabled ? `agent-${logId}.ndjson` : `agent-${logId}.log`
      const legacyLogFilename = typedStreamingEnabled && legacyLogFormat ? `agent-${logId}.log` : null
      const streamParser: StreamParserInterface | null = typedStreamingEnabled ? (adapter.createStreamParser?.() ?? null) : null
      const streamSummary: StreamSummary = { textBlocks: 0, reasoningBlocks: 0, toolCalls: 0, toolResults: 0, errors: 0 }
      const logFilename = streamLogFilename
      let logPath: string | undefined
      log.debug('Starting execution', { logId, typedStreaming: typedStreamingEnabled })
      messageParserRef.current = adapter.createMessageParser(maxEntries * 2, props.onToolCall)

      try {
        const childrenString = extractText(props.children)
        const { prompt, mcpConfigPath } = await adapter.extractPrompt(childrenString, props)
        const retryOnValidationFailure = props.retryOnValidationFailure === true
        const middlewareStack = [...(providerMiddleware ?? []), ...(props.middleware ?? [])]
        const internalMiddlewares = [
          retryMiddleware({ maxRetries: props.maxRetries ?? 3, baseDelayMs: props.retryDelayMs, retryOn: (e) => e instanceof ValidationError ? retryOnValidationFailure : true, onRetry: (attempt, e) => { const max = props.maxRetries ?? 3; const isVal = e instanceof ValidationError; log.warn('Retrying', { attempt, max, isVal, error: e instanceof Error ? e.message : String(e) }); props.onProgress?.(isVal ? `Validation failed, retrying (${attempt}/${max})...` : `Error occurred, retrying (${attempt}/${max})...`) } }),
        ]
        if (props.validate) internalMiddlewares.push(validationMiddleware({ validate: props.validate }))
        const middlewares = [...middlewareStack, ...internalMiddlewares]
        const composed = composeMiddleware(...middlewares)
        const baseOptions = adapter.buildOptions(props, { prompt, cwd, mcpConfigPath })
        const defaultFormat = adapter.getDefaultOutputFormat?.(props)
        if (defaultFormat !== undefined) (baseOptions as Record<string, unknown>)['outputFormat'] = defaultFormat
        const executionOptions = composed.transformOptions ? await composed.transformOptions(baseOptions as Parameters<typeof composed.transformOptions>[0]) : baseOptions
        const execOpts = executionOptions as Record<string, unknown>
        const promptForDb = execOpts['prompt'] as string
        const systemPromptForDb = execOpts['systemPrompt'] as string | undefined

        if (props.reportingEnabled !== false) {
          logPath = logWriter.appendLog(logFilename, '')
          currentAgentId = await db.agents.start(promptForDb, adapter.getAgentLabel(executionOptions as TOptions), systemPromptForDb, logPath)
          agentIdRef.current = currentAgentId
          log.info('Agent started', { agentId: currentAgentId, logPath })
        }

        const agentDisplayLabel = adapter.getAgentLabel(executionOptions as TOptions)
        log.debug('Executing CLI', { label: agentDisplayLabel })
        props.onProgress?.(`Starting ${adapter.name} agent with: ${agentDisplayLabel}`)

        const handleStreamPart = (part: SmithersStreamPart) => {
          logWriter.appendStreamPart(logFilename, part)
          if (recordStreamEvents && currentAgentId) db.agents.recordStreamEvent(currentAgentId, part)
          if (part.type === 'text-end') streamSummary.textBlocks += 1
          else if (part.type === 'reasoning-end') streamSummary.reasoningBlocks += 1
          else if (part.type === 'tool-call') streamSummary.toolCalls += 1
          else if (part.type === 'tool-result') streamSummary.toolResults += 1
          else if (part.type === 'error') streamSummary.errors += 1
          props.onStreamPart?.(part)
        }

        const handleTailLogUpdate = () => {
          const now = Date.now()
          const timeSinceLastUpdate = now - lastTailLogUpdateRef.current
          if (timeSinceLastUpdate >= DEFAULT_TAIL_LOG_THROTTLE_MS) {
            lastTailLogUpdateRef.current = now
            if (isMounted() && messageParserRef.current) { tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries); invalidateAndUpdate() }
          } else if (!pendingTailLogUpdateRef.current) {
            pendingTailLogUpdateRef.current = setTimeout(() => { pendingTailLogUpdateRef.current = null; lastTailLogUpdateRef.current = Date.now(); if (isMounted() && messageParserRef.current) { tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries); invalidateAndUpdate() } }, DEFAULT_TAIL_LOG_THROTTLE_MS - timeSinceLastUpdate)
          }
        }

        const upstreamOnProgress = execOpts['onProgress'] as ((msg: string) => void) | undefined
        const onProgress = (chunk: string) => {
          if (typedStreamingEnabled && streamParser) {
            // Write raw chunk to legacy log file if legacyLogFormat is enabled
            if (legacyLogFilename) logWriter.appendLog(legacyLogFilename, chunk)
            const parts = streamParser.parse(chunk)
            for (const part of parts) {
              handleStreamPart(part)
              if (part.type === 'text-delta' && messageParserRef.current) { messageParserRef.current.parseChunk(part.delta); handleTailLogUpdate() }
              else if (part.type === 'tool-call') {
                if (messageParserRef.current) { messageParserRef.current.parseChunk(`Tool: ${part.toolName}\n${part.input}\n\n`); handleTailLogUpdate() }
                if (props.onToolCall) { try { props.onToolCall(part.toolName, JSON.parse(part.input)) } catch { props.onToolCall(part.toolName, part.input) } }
              }
            }
            return
          }
          const transformedChunk = composed.transformChunk ? composed.transformChunk(chunk) : chunk
          if (logFilename) logWriter.appendLog(logFilename, transformedChunk)
          if (messageParserRef.current) { messageParserRef.current.parseChunk(transformedChunk); handleTailLogUpdate() }
          upstreamOnProgress?.(transformedChunk)
          props.onProgress?.(transformedChunk)
        }

        const execute = async () => adapter.execute({ ...executionOptions, onProgress } as TOptions & { onProgress: (chunk: string) => void })
        const wrappedExecute = composed.wrapExecute ? () => composed.wrapExecute!({ doExecute: execute, options: executionOptions as Parameters<typeof composed.wrapExecute>[0]['options'] }) : execute
        let agentResult = await wrappedExecute()
        if (composed.transformResult) agentResult = await composed.transformResult(agentResult)

        if (typedStreamingEnabled && streamParser) {
          for (const part of streamParser.flush()) handleStreamPart(part)
          if (agentResult.sessionId) handleStreamPart({ type: 'session-info', sessionId: agentResult.sessionId, model: agentDisplayLabel })
          if (props.reportingEnabled !== false && currentAgentId) db.agents.setStreamSummary(currentAgentId, streamSummary)
          logWriter.writeStreamSummaryFromCounts(logFilename, streamSummary)
        }

        if (messageParserRef.current) messageParserRef.current.flush()
        if (pendingTailLogUpdateRef.current) { clearTimeout(pendingTailLogUpdateRef.current); pendingTailLogUpdateRef.current = null }
        if (messageParserRef.current) tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
        invalidateAndUpdate()

        if (props.reportingEnabled !== false && currentAgentId) await db.agents.complete(currentAgentId, agentResult.output, agentResult.structured, agentResult.tokensUsed)
        const totalDurationMs = endTotalTiming()
        log.info('Agent completed', { agentId: currentAgentId, tokensInput: agentResult.tokensUsed?.input, tokensOutput: agentResult.tokensUsed?.output, durationMs: totalDurationMs, stopReason: agentResult.stopReason })

        if (props.reportingEnabled !== false && agentResult.output) {
          const reportData = { type: 'progress' as const, title: `${adapter.getLoggerName()} ${agentDisplayLabel} completed`, content: agentResult.output.slice(0, 500), data: { tokensUsed: agentResult.tokensUsed, turnsUsed: agentResult.turnsUsed, durationMs: agentResult.durationMs } }
          if (currentAgentId) await db.vcs.addReport({ ...reportData, agent_id: currentAgentId })
          else await db.vcs.addReport(reportData)
        }
        if (isMounted()) props.onFinished?.(agentResult)
      } catch (err) {
        endTotalTiming()
        const errorObj = err instanceof Error ? err : new Error(String(err))
        log.error('Agent execution failed', errorObj, { agentId: currentAgentId })
        if (props.reportingEnabled !== false && currentAgentId) await db.agents.fail(currentAgentId, errorObj.message)
        if (props.reportingEnabled !== false) {
          const loggerContext = adapter.getLoggerContext(props)
          const modelLabel = loggerContext['model'] ?? loggerContext['mode'] ?? ''
          const errorData = { type: 'error' as const, title: `${adapter.getLoggerName()} ${modelLabel} failed`, content: errorObj.message, severity: 'warning' as const }
          if (currentAgentId) await db.vcs.addReport({ ...errorData, agent_id: currentAgentId })
          else await db.vcs.addReport(errorData)
        }
        if (isMounted()) props.onError?.(errorObj)
      } finally {
        await logWriter.flushStream(logFilename)
        if (legacyLogFilename) await logWriter.flushStream(legacyLogFilename)
        if (taskIdRef.current) db.tasks.complete(taskIdRef.current)
      }
    })().catch(err => { const errorObj = err instanceof Error ? err : new Error(String(err)); log.error('Unhandled agent execution error', errorObj); props.onError?.(errorObj) })
  }, [shouldExecute, log, adapter, props, cwd, maxEntries])

  return { status, agentId: agentIdRef.current, executionId: executionId ?? null, result, error, tailLog: tailLogRef.current }
}
