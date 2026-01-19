import { useRef, useReducer, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useWorktree } from './WorktreeProvider.js'
import { usePhaseContext } from './PhaseContext.js'
import { useStepContext } from './StepContext.js'
import { useRalphCount } from '../hooks/useRalphCount.js'
import { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from '../utils/mcp-config.js'
import type { ClaudeProps, AgentResult, CLIExecutionOptions } from './agents/types.js'
import { useMountedState, useEffectOnValueChange } from '../reconciler/hooks.js'
import { LogWriter } from '../monitor/log-writer.js'
import { uuid } from '../db/utils.js'
import { MessageParser, truncateToLastLines, type TailLogEntry } from './agents/claude-cli/message-parser.js'
import { useQuery } from '../reactive-sqlite/index.js'
import { extractText } from '../utils/extract-text.js'
import { composeMiddleware } from '../middleware/compose.js'
import { retryMiddleware } from '../middleware/retry.js'
import { validationMiddleware, ValidationError } from '../middleware/validation.js'
import { ClaudeStreamParser } from '../streaming/claude-parser.js'
import type { SmithersStreamPart } from '../streaming/types.js'
import type { StreamSummary } from '../db/types.js'
import { PlanNodeProvider, usePlanNodeProps } from './PlanNodeContext.js'

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
 * Claude Agent Component
 *
 * Executes Claude CLI as a React component with database tracking,
 * progress reporting, and retry logic.
 *
 * @example
 * ```tsx
 * <Claude model="sonnet" onFinished={(result) => console.log(result.output)}>
 *   Fix the bug in src/utils.ts
 * </Claude>
 * ```
 */
export function Claude(props: ClaudeProps): ReactNode {
  const { db, reactiveDb, executionId, isStopRequested, middleware: providerMiddleware, executionEnabled } = useSmithers()
  const worktree = useWorktree()
  const phase = usePhaseContext()
  const phaseActive = phase?.isActive ?? true
  const step = useStepContext()
  const stepActive = step?.isActive ?? true
  const ralphCount = useRalphCount()
  const cwd = props.cwd ?? worktree?.cwd
  const { nodeId, planNodeProps } = usePlanNodeProps()

  // TODO abstract all the following block of lines into named hooks
  const agentIdRef = useRef<string | null>(null)
  const tailLogRef = useRef<TailLogEntry[]>([])
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
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
    turnsUsed: 0, // Not stored in DB (we ralph), default to 0
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

  const shouldExecute = executionEnabled && phaseActive && stepActive
  const executionKey = shouldExecute ? ralphCount : null

  useEffectOnValueChange(executionKey, () => {
    if (!shouldExecute) return
    ;(async () => {
      taskIdRef.current = db.tasks.start('claude', props.model ?? 'sonnet')

      if (isStopRequested()) {
        db.tasks.complete(taskIdRef.current)
        return
      }

      let currentAgentId: string | null = null

      const logWriter = new LogWriter(undefined, executionId ?? undefined)
      const logId = uuid()
      const typedStreamingEnabled = props.experimentalTypedStreaming ?? false
      const useLegacyLogFormat = typedStreamingEnabled && (props.legacyLogFormat ?? false)
      const recordStreamEvents = props.recordStreamEvents ?? props.reportingEnabled !== false
      const streamLogFilename = typedStreamingEnabled ? `agent-${logId}.ndjson` : `agent-${logId}.log`
      const legacyLogFilename = useLegacyLogFormat ? `agent-${logId}.log.legacy.txt` : null
      const streamParser = typedStreamingEnabled ? new ClaudeStreamParser() : null
      const streamSummary: StreamSummary = {
        textBlocks: 0,
        reasoningBlocks: 0,
        toolCalls: 0,
        toolResults: 0,
        errors: 0,
      }
      const logFilename = streamLogFilename
      let logPath: string | undefined

      try {
        const childrenString = extractText(props.children)

        const { configs: mcpConfigs, cleanPrompt, toolInstructions } = extractMCPConfigs(childrenString)

        let prompt = cleanPrompt
        if (toolInstructions) {
          prompt = `${toolInstructions}\n\n---\n\n${cleanPrompt}`
        }

        let mcpConfigPath = props.mcpConfig
        if (mcpConfigs.length > 0) {
          const mcpConfig = generateMCPServerConfig(mcpConfigs)
          mcpConfigPath = await writeMCPConfigFile(mcpConfig)
        }

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
              if (error instanceof ValidationError) {
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

        const baseOptions: CLIExecutionOptions = {
          prompt,
        }
        if (props.model !== undefined) baseOptions.model = props.model
        if (props.permissionMode !== undefined) baseOptions.permissionMode = props.permissionMode
        if (props.maxTurns !== undefined) baseOptions.maxTurns = props.maxTurns
        if (props.systemPrompt !== undefined) baseOptions.systemPrompt = props.systemPrompt
        if (props.outputFormat !== undefined) baseOptions.outputFormat = props.outputFormat
        if (mcpConfigPath !== undefined) baseOptions.mcpConfig = mcpConfigPath
        if (props.allowedTools !== undefined) baseOptions.allowedTools = props.allowedTools
        if (props.disallowedTools !== undefined) baseOptions.disallowedTools = props.disallowedTools
        if (cwd !== undefined) baseOptions.cwd = cwd
        if (props.timeout !== undefined) baseOptions.timeout = props.timeout
        if (props.stopConditions !== undefined) baseOptions.stopConditions = props.stopConditions
        if (props.continueConversation !== undefined) baseOptions.continue = props.continueConversation
        if (props.resumeSession !== undefined) baseOptions.resume = props.resumeSession
        if (props.onToolCall !== undefined) baseOptions.onToolCall = props.onToolCall
        if (props.schema !== undefined) baseOptions.schema = props.schema
        if (props.schemaRetries !== undefined) baseOptions.schemaRetries = props.schemaRetries
        if (props.useSubscription !== undefined) baseOptions.useSubscription = props.useSubscription
        if (typedStreamingEnabled && props.outputFormat === undefined) baseOptions.outputFormat = 'stream-json'

        const executionOptions = composed.transformOptions
          ? await composed.transformOptions(baseOptions)
          : baseOptions

        // Log agent start to database if reporting is enabled
        if (props.reportingEnabled !== false) {
          logPath = logWriter.appendLog(logFilename, '')
          if (legacyLogFilename) {
            logWriter.appendLog(legacyLogFilename, '')
          }

          currentAgentId = await db.agents.start(
            executionOptions.prompt,
            executionOptions.model ?? 'sonnet',
            executionOptions.systemPrompt,
            logPath
          )
          agentIdRef.current = currentAgentId
        }

        // Report progress
        props.onProgress?.(`Starting Claude agent with model: ${executionOptions.model ?? 'sonnet'}`)

        // Stream part handler for typed streaming
        const handleStreamPart = (part: SmithersStreamPart) => {
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

        // Tail log update handler
        const handleTailLogUpdate = () => {
          const now = Date.now()
          const timeSinceLastUpdate = now - lastTailLogUpdateRef.current

          if (timeSinceLastUpdate >= DEFAULT_TAIL_LOG_THROTTLE_MS) {
            lastTailLogUpdateRef.current = now
            if (isMounted()) {
              tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
              forceUpdate()
            }
          } else if (!pendingTailLogUpdateRef.current) {
            pendingTailLogUpdateRef.current = setTimeout(() => {
              pendingTailLogUpdateRef.current = null
              lastTailLogUpdateRef.current = Date.now()
              if (isMounted()) {
                tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
                forceUpdate()
              }
            }, DEFAULT_TAIL_LOG_THROTTLE_MS - timeSinceLastUpdate)
          }
        }

        const upstreamOnProgress = executionOptions.onProgress
        const onProgress = (chunk: string) => {
          // Handle typed streaming
          if (typedStreamingEnabled && streamParser) {
            const parts = streamParser.parse(chunk)
            if (useLegacyLogFormat && legacyLogFilename) {
              logWriter.appendLog(legacyLogFilename, chunk)
            }
            for (const part of parts) {
              handleStreamPart(part)
              if (part.type === 'text-delta') {
                messageParserRef.current.parseChunk(part.delta)
                handleTailLogUpdate()
              } else if (part.type === 'tool-call') {
                messageParserRef.current.parseChunk(`Tool: ${part.toolName}\n${part.input}\n\n`)
                handleTailLogUpdate()
                if (props.onToolCall) {
                  try {
                    props.onToolCall(part.toolName, JSON.parse(part.input))
                  } catch {
                    props.onToolCall(part.toolName, part.input)
                  }
                }
              }
            }
            return
          }

          const transformedChunk = composed.transformChunk
            ? composed.transformChunk(chunk)
            : chunk

          // Stream to log file
          if (logFilename) {
            logWriter.appendLog(logFilename, transformedChunk)
          }

          // Parse for tail log
          messageParserRef.current.parseChunk(transformedChunk)
          handleTailLogUpdate()

          upstreamOnProgress?.(transformedChunk)
          props.onProgress?.(transformedChunk)
        }

        const execute = async () => {
          const result = await executeClaudeCLI({
            ...executionOptions,
            onProgress,
          })

          if (result.stopReason === 'error') {
            throw new Error(result.output || 'Claude CLI execution failed')
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

        // Finalize typed streaming
        if (typedStreamingEnabled && streamParser) {
          const remainingParts = streamParser.flush()
          for (const part of remainingParts) {
            handleStreamPart(part)
          }
          if (agentResult.sessionId) {
            handleStreamPart({
              type: 'session-info',
              sessionId: agentResult.sessionId,
              model: props.model ?? 'sonnet',
            })
          }
          if (props.reportingEnabled !== false && currentAgentId) {
            db.agents.setStreamSummary(currentAgentId, streamSummary)
          }
          logWriter.writeStreamSummaryFromCounts(logFilename, streamSummary)
        }

        // Flush message parser to capture any remaining content
        messageParserRef.current.flush()
        if (pendingTailLogUpdateRef.current) {
          clearTimeout(pendingTailLogUpdateRef.current)
          pendingTailLogUpdateRef.current = null
        }
        tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
        forceUpdate()

        if (props.reportingEnabled !== false && currentAgentId) {
          await db.agents.complete(
            currentAgentId,
            agentResult.output,
            agentResult.structured,
            agentResult.tokensUsed
          )
        }

        if (props.reportingEnabled !== false && agentResult.output) {
          const reportData = {
            type: 'progress' as const,
            title: `Claude ${props.model ?? 'sonnet'} completed`,
            content: agentResult.output.slice(0, 500), // First 500 chars
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
        const errorObj = err instanceof Error ? err : new Error(String(err))

        // ALWAYS log to DB regardless of mount state - DB records should not be suppressed
        if (props.reportingEnabled !== false && currentAgentId) {
          await db.agents.fail(currentAgentId, errorObj.message)
        }

        if (props.reportingEnabled !== false) {
          const errorData = {
            type: 'error' as const,
            title: `Claude ${props.model ?? 'sonnet'} failed`,
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

        // Only fire React callbacks if still mounted
        if (isMounted()) {
          props.onError?.(errorObj)
        }
      } finally {
        // Flush log stream to ensure all writes complete before exit
        await logWriter.flushStream(logFilename)
        if (legacyLogFilename) {
          await logWriter.flushStream(legacyLogFilename)
        }
        // Always complete task
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })().catch(err => {
      console.error('Agent execution failed:', err)
      props.onError?.(err instanceof Error ? err : new Error(String(err)))
    })
  }, [shouldExecute])

  const maxLines = props.tailLogLines ?? 10
  const tailLog = tailLogRef.current
  const displayEntries = status === 'complete'
    ? tailLog.slice(-1)
    : tailLog.slice(-maxEntries)

  return (
    <PlanNodeProvider nodeId={nodeId}>
      <claude
        status={status}
        agent-id={agentIdRef.current}
        execution-id={executionId}
        model={props.model ?? 'sonnet'}
        {...(error?.message ? { error: error.message } : {})}
        {...(result?.tokensUsed?.input !== undefined ? { 'tokens-input': result.tokensUsed.input } : {})}
        {...(result?.tokensUsed?.output !== undefined ? { 'tokens-output': result.tokensUsed.output } : {})}
        {...(result?.turnsUsed !== undefined ? { 'turns-used': result.turnsUsed } : {})}
        {...(result?.durationMs !== undefined ? { 'duration-ms': result.durationMs } : {})}
        {...planNodeProps}
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
      </claude>
    </PlanNodeProvider>
  )
}

export type { ClaudeProps, AgentResult }
export { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
