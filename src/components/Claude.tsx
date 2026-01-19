import { useRef, useReducer, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useWorktree } from './WorktreeProvider.js'
import { usePhaseContext } from './PhaseContext.js'
import { useStepContext } from './StepContext.js'
import { useRalphCount } from '../hooks/useRalphCount.js'
import { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from '../utils/mcp-config.js'
import type { ClaudeProps, AgentResult } from './agents/types.js'
import { useMountedState, useEffectOnValueChange } from '../reconciler/hooks.js'
import { LogWriter } from '../monitor/log-writer.js'
import { uuid } from '../db/utils.js'
import { MessageParser, truncateToLastLines, type TailLogEntry } from './agents/claude-cli/message-parser.js'
import { useQuery } from '../reactive-sqlite/index.js'

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

// TODO: add jsdoc
export function Claude(props: ClaudeProps): ReactNode {
  const { db, reactiveDb, executionId, isStopRequested } = useSmithers()
  const worktree = useWorktree()
  const phase = usePhaseContext()
  const phaseActive = phase?.isActive ?? true
  const step = useStepContext()
  const stepActive = step?.isActive ?? true
  const ralphCount = useRalphCount()
  const cwd = props.cwd ?? worktree?.cwd

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
    structured: agentRow.result_structured ? JSON.parse(agentRow.result_structured) : undefined,
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

  const shouldExecute = phaseActive && stepActive
  const executionKey = `${ralphCount}:${shouldExecute ? 'active' : 'inactive'}`

  // TODO: should be handled by an event handler not a useEffect
  useEffectOnValueChange(executionKey, () => {
    if (!shouldExecute) return
    ;(async () => {
      taskIdRef.current = db.tasks.start('claude', props.model ?? 'sonnet')

      if (isStopRequested()) {
        db.tasks.complete(taskIdRef.current)
        return
      }

      let currentAgentId: string | null = null
      let retryCount = 0
      const maxRetries = props.maxRetries ?? 3

      const logWriter = new LogWriter(undefined, executionId ?? undefined)
      const logFilename = `agent-${uuid()}.log`
      let logPath: string | undefined

      try {
        const childrenString = String(props.children)

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

        if (props.reportingEnabled !== false) {
          logPath = logWriter.appendLog(logFilename, '')
          
          currentAgentId = await db.agents.start(
            prompt,
            props.model ?? 'sonnet',
            props.systemPrompt,
            logPath
          )
          agentIdRef.current = currentAgentId
        }

        props.onProgress?.(`Starting Claude agent with model: ${props.model ?? 'sonnet'}`)

        let agentResult: AgentResult | null = null
        let lastError: Error | null = null

        while (retryCount <= maxRetries) {
          try {
            agentResult = await executeClaudeCLI({
              prompt,
              ...(props.model !== undefined ? { model: props.model } : {}),
              ...(props.permissionMode !== undefined ? { permissionMode: props.permissionMode } : {}),
              ...(props.maxTurns !== undefined ? { maxTurns: props.maxTurns } : {}),
              ...(props.systemPrompt !== undefined ? { systemPrompt: props.systemPrompt } : {}),
              ...(props.outputFormat !== undefined ? { outputFormat: props.outputFormat } : {}),
              ...(mcpConfigPath !== undefined ? { mcpConfig: mcpConfigPath } : {}),
              ...(props.allowedTools !== undefined ? { allowedTools: props.allowedTools } : {}),
              ...(props.disallowedTools !== undefined ? { disallowedTools: props.disallowedTools } : {}),
              ...(cwd !== undefined ? { cwd } : {}),
              ...(props.timeout !== undefined ? { timeout: props.timeout } : {}),
              ...(props.stopConditions !== undefined ? { stopConditions: props.stopConditions } : {}),
              ...(props.continueConversation !== undefined ? { continue: props.continueConversation } : {}),
              ...(props.resumeSession !== undefined ? { resume: props.resumeSession } : {}),
              ...(props.onToolCall !== undefined ? { onToolCall: props.onToolCall } : {}),
              ...(props.schema !== undefined ? { schema: props.schema } : {}),
              ...(props.schemaRetries !== undefined ? { schemaRetries: props.schemaRetries } : {}),
              ...(props.useSubscription !== undefined ? { useSubscription: props.useSubscription } : {}),
              onProgress: (chunk) => {
                if (logFilename) {
                  logWriter.appendLog(logFilename, chunk)
                }

                messageParserRef.current.parseChunk(chunk)

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

                props.onProgress?.(chunk)
              },
            })

            if (agentResult.stopReason === 'error') {
              throw new Error(agentResult.output || 'Claude CLI execution failed')
            }

            if (props.validate) {
              const isValid = await props.validate(agentResult)
              if (!isValid) {
                if (props.retryOnValidationFailure && retryCount < maxRetries) {
                  retryCount++
                  props.onProgress?.(`Validation failed, retrying (${retryCount}/${maxRetries})...`)
                  continue
                }
                throw new Error('Validation failed')
              }
            }

            break
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))

            if (retryCount < maxRetries) {
              retryCount++
              props.onProgress?.(`Error occurred, retrying (${retryCount}/${maxRetries})...`)
              await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount)) // Exponential backoff
            } else {
              throw lastError
            }
          }
        }

        if (!agentResult) {
          throw lastError ?? new Error('No result from Claude CLI')
        }

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
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))

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

          props.onError?.(errorObj)
        }
      } finally {
        // Flush log stream to ensure all writes complete before exit
        await logWriter.flushStream(logFilename)
        // Always complete task
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  const maxLines = props.tailLogLines ?? 10
  const tailLog = tailLogRef.current
  const displayEntries = status === 'complete'
    ? tailLog.slice(-1)
    : tailLog.slice(-maxEntries)

  return (
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
  )
}

export type { ClaudeProps, AgentResult }
export { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
