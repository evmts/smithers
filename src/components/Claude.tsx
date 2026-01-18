// Enhanced Claude component for Smithers orchestrator
// Uses SmithersProvider context for database logging and ClaudeCodeCLI for execution

import { useRef, useReducer, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useWorktree } from './WorktreeProvider.js'
import { useRalphCount } from '../hooks/useRalphCount.js'
import { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from '../utils/mcp-config.js'
import type { ClaudeProps, AgentResult } from './agents/types.js'
import { useMountedState, useEffectOnValueChange } from '../reconciler/hooks.js'
import { LogWriter } from '../monitor/log-writer.js'
import { uuid } from '../db/utils.js'
import { MessageParser, truncateToLastLines, type TailLogEntry } from './agents/claude-cli/message-parser.js'
import { useQuery } from '../reactive-sqlite/index.js'

// ============================================================================
// CLAUDE COMPONENT
// ============================================================================

/**
 * Enhanced Claude component with database logging and CLI execution.
 *
 * CRITICAL PATTERN: This component is BOTH declaration AND execution.
 * Instead of relying on remounting via key, it reacts to ralphCount
 * changes from Ralph and explicitly restarts execution.
 *
 * React pattern: Use useEffect with ralphCount dependency:
 *   useEffect(() => {
 *     (async () => { ... })()
 *   }, [ralphCount])
 *
 * Usage:
 * ```tsx
 * <Claude
 *   model="sonnet"
 *   maxTurns={5}
 *   reportingEnabled
 *   onFinished={(result) => console.log('Done:', result)}
 * >
 *   Implement a feature that does X
 * </Claude>
 * ```
 */
// Default throttle interval for tail log updates (ms)
const DEFAULT_TAIL_LOG_THROTTLE_MS = 100

// Type for agent row from DB
type AgentRow = {
  status: string
  result: string | null
  result_structured: string | null
  error: string | null
  tokens_input: number | null
  tokens_output: number | null
  duration_ms: number | null
}

export function Claude(props: ClaudeProps): ReactNode {
  const { db, reactiveDb, executionId, isStopRequested } = useSmithers()
  const worktree = useWorktree()
  const ralphCount = useRalphCount()

  // agentId stored in ref (set once, non-reactive until set)
  const agentIdRef = useRef<string | null>(null)

  // tailLog stored in ref with forceUpdate for reactivity
  const tailLogRef = useRef<TailLogEntry[]>([])
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // Query reactive state from DB
  const { data: agentRows } = useQuery<AgentRow>(
    reactiveDb,
    "SELECT status, result, result_structured, error, tokens_input, tokens_output, duration_ms FROM agents WHERE id = ?",
    [agentIdRef.current ?? '']
  )
  const agentRow = agentRows[0] ?? null

  // Derive state from DB row
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
    turnsUsed: 0, // Not stored in DB, default to 0
    durationMs: agentRow.duration_ms ?? 0,
    stopReason: 'completed',
  } : null
  
  const error: Error | null = agentRow?.error ? new Error(agentRow.error) : null

  // Track task ID for this component
  const taskIdRef = useRef<string | null>(null)
  // Limit stored entries in MessageParser to prevent unbounded growth
  const maxEntries = props.tailLogCount ?? 10
  const messageParserRef = useRef<MessageParser>(new MessageParser(maxEntries * 2))
  const isMounted = useMountedState()

  // Throttle refs for tail log updates to reduce re-renders
  const lastTailLogUpdateRef = useRef<number>(0)
  const pendingTailLogUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Execute once per ralphCount change (idempotent, handles React strict mode)
  useEffectOnValueChange(ralphCount, () => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = db.tasks.start('claude', props.model ?? 'sonnet')

      // Check if stop has been requested globally
      if (isStopRequested()) {
        db.tasks.complete(taskIdRef.current)
        return
      }

      let currentAgentId: string | null = null
      let retryCount = 0
      const maxRetries = props.maxRetries ?? 3

      // Initialize LogWriter
      const logWriter = new LogWriter(undefined, executionId ?? undefined)
      const logFilename = `agent-${uuid()}.log`
      let logPath: string | undefined

      try {
        // Extract prompt from children
        const childrenString = String(props.children)

        // Check for MCP tool components
        const { configs: mcpConfigs, cleanPrompt, toolInstructions } = extractMCPConfigs(childrenString)

        // Build final prompt with tool instructions
        let prompt = cleanPrompt
        if (toolInstructions) {
          prompt = `${toolInstructions}\n\n---\n\n${cleanPrompt}`
        }

        // Generate MCP config file if needed
        let mcpConfigPath = props.mcpConfig
        if (mcpConfigs.length > 0) {
          const mcpConfig = generateMCPServerConfig(mcpConfigs)
          mcpConfigPath = await writeMCPConfigFile(mcpConfig)
        }

        // Log agent start to database if reporting is enabled
        if (props.reportingEnabled !== false) {
          // Initialize log file
          logPath = logWriter.appendLog(logFilename, '')
          
          currentAgentId = await db.agents.start(
            prompt,
            props.model ?? 'sonnet',
            props.systemPrompt,
            logPath
          )
          agentIdRef.current = currentAgentId
        }

        // Report progress
        props.onProgress?.(`Starting Claude agent with model: ${props.model ?? 'sonnet'}`)

        // Execute with retry logic
        let agentResult: AgentResult | null = null
        let lastError: Error | null = null

        while (retryCount <= maxRetries) {
          try {
            // Execute via Claude CLI
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
              ...(props.cwd !== undefined || worktree?.cwd ? { cwd: props.cwd ?? worktree?.cwd } : {}),
              ...(props.timeout !== undefined ? { timeout: props.timeout } : {}),
              ...(props.stopConditions !== undefined ? { stopConditions: props.stopConditions } : {}),
              ...(props.continueConversation !== undefined ? { continue: props.continueConversation } : {}),
              ...(props.resumeSession !== undefined ? { resume: props.resumeSession } : {}),
              ...(props.onToolCall !== undefined ? { onToolCall: props.onToolCall } : {}),
              ...(props.schema !== undefined ? { schema: props.schema } : {}),
              ...(props.schemaRetries !== undefined ? { schemaRetries: props.schemaRetries } : {}),
              onProgress: (chunk) => {
                // Stream to log file
                if (logFilename) {
                  logWriter.appendLog(logFilename, chunk)
                }

                // Parse for tail log
                messageParserRef.current.parseChunk(chunk)

                // Throttle tail log updates to reduce re-renders
                const now = Date.now()
                const timeSinceLastUpdate = now - lastTailLogUpdateRef.current

                if (timeSinceLastUpdate >= DEFAULT_TAIL_LOG_THROTTLE_MS) {
                  // Enough time has passed, update immediately
                  lastTailLogUpdateRef.current = now
                  if (isMounted()) {
                    tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
                    forceUpdate()
                  }
                } else if (!pendingTailLogUpdateRef.current) {
                  // Schedule an update for later
                  pendingTailLogUpdateRef.current = setTimeout(() => {
                    pendingTailLogUpdateRef.current = null
                    lastTailLogUpdateRef.current = Date.now()
                    if (isMounted()) {
                      tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
                      forceUpdate()
                    }
                  }, DEFAULT_TAIL_LOG_THROTTLE_MS - timeSinceLastUpdate)
                }

                // Call original onProgress
                props.onProgress?.(chunk)
              },
            })

            // Check for execution errors
            if (agentResult.stopReason === 'error') {
              throw new Error(agentResult.output || 'Claude CLI execution failed')
            }

            // Validate result if validator provided
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

            // Success - break out of retry loop
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

        // Flush message parser to capture any remaining content
        messageParserRef.current.flush()
        // Cancel any pending throttled update
        if (pendingTailLogUpdateRef.current) {
          clearTimeout(pendingTailLogUpdateRef.current)
          pendingTailLogUpdateRef.current = null
        }
        tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
        forceUpdate()

        // Log completion to database
        if (props.reportingEnabled !== false && currentAgentId) {
          await db.agents.complete(
            currentAgentId,
            agentResult.output,
            agentResult.structured,
            agentResult.tokensUsed
          )
        }

        // Add report if there's notable output
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
          // DB update via db.agents.complete() triggers reactive re-render
          props.onFinished?.(agentResult)
        }
      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))

          // Log failure to database - this triggers reactive re-render
          if (props.reportingEnabled !== false && currentAgentId) {
            await db.agents.fail(currentAgentId, errorObj.message)
          }

          // Add error report
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

  // Render custom element for XML serialization
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

// ============================================================================
// EXPORTS
// ============================================================================

export type { ClaudeProps, AgentResult }
export { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
