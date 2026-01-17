// Enhanced Claude component for Smithers orchestrator
// Uses SmithersProvider context for database logging and ClaudeCodeCLI for execution

import { createSignal, onMount, useContext, type JSX } from 'solid-js'
import { RalphContext } from '../../components/Ralph'
import { useSmithers } from './SmithersProvider'
import { executeClaudeCLI } from './agents/ClaudeCodeCLI'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from '../utils/mcp-config'
import type { ClaudeProps, AgentResult } from './agents/types'

// ============================================================================
// CLAUDE COMPONENT
// ============================================================================

/**
 * Enhanced Claude component with database logging and CLI execution.
 *
 * CRITICAL PATTERN: This component is BOTH declaration AND execution.
 * When it mounts, it executes itself. No external orchestrator needed.
 *
 * GOTCHA: Use fire-and-forget async IIFE inside onMount:
 *   onMount(() => {
 *     (async () => { ... })()  // Fire and forget
 *   })
 *
 * NOT: onMount(async () => { ... })  // Doesn't work!
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
export function Claude(props: ClaudeProps): JSX.Element {
  const { db, executionId, isStopRequested } = useSmithers()
  const ralph = useContext(RalphContext)

  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = createSignal<AgentResult | null>(null)
  const [error, setError] = createSignal<Error | null>(null)
  const [agentId, setAgentId] = createSignal<string | null>(null)

  onMount(() => {
    // Fire-and-forget async IIFE
    // This is the CRITICAL pattern for async execution in Solid onMount
    (async () => {
      // Register with Ralph (if present)
      ralph?.registerTask()

      // Check if stop has been requested globally
      if (isStopRequested()) {
        ralph?.completeTask()
        return
      }

      let currentAgentId: string | null = null
      let retryCount = 0
      const maxRetries = props.maxRetries ?? 3

      try {
        setStatus('running')

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
          currentAgentId = await db.agents.start(
            prompt,
            props.model ?? 'sonnet',
            props.systemPrompt
          )
          setAgentId(currentAgentId)
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
              model: props.model,
              permissionMode: props.permissionMode,
              maxTurns: props.maxTurns,
              systemPrompt: props.systemPrompt,
              outputFormat: props.outputFormat,
              mcpConfig: mcpConfigPath,
              allowedTools: props.allowedTools,
              disallowedTools: props.disallowedTools,
              timeout: props.timeout,
              stopConditions: props.stopConditions,
              continue: props.continueConversation,
              resume: props.resumeSession,
              onProgress: props.onProgress,
              onToolCall: props.onToolCall,
              schema: props.schema,
              schemaRetries: props.schemaRetries,
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
          await db.vcs.addReport({
            type: 'progress',
            title: `Claude ${props.model ?? 'sonnet'} completed`,
            content: agentResult.output.slice(0, 500), // First 500 chars
            data: {
              tokensUsed: agentResult.tokensUsed,
              turnsUsed: agentResult.turnsUsed,
              durationMs: agentResult.durationMs,
            },
            agent_id: currentAgentId ?? undefined,
          })
        }

        setResult(agentResult)
        setStatus('complete')
        props.onFinished?.(agentResult)
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setStatus('error')

        // Log failure to database
        if (props.reportingEnabled !== false && currentAgentId) {
          await db.agents.fail(currentAgentId, errorObj.message)
        }

        // Add error report
        if (props.reportingEnabled !== false) {
          await db.vcs.addReport({
            type: 'error',
            title: `Claude ${props.model ?? 'sonnet'} failed`,
            content: errorObj.message,
            severity: 'warning',
            agent_id: currentAgentId ?? undefined,
          })
        }

        props.onError?.(errorObj)
      } finally {
        // Always complete task with Ralph
        ralph?.completeTask()
      }
    })()
    // Note: No await, no return - just fire and forget
  })

  // Render custom element for XML serialization
  return (
    <claude
      status={status()}
      agent-id={agentId()}
      execution-id={executionId}
      model={props.model ?? 'sonnet'}
      result={result()?.output?.slice(0, 200)}
      error={error()?.message}
      tokens-input={result()?.tokensUsed?.input}
      tokens-output={result()?.tokensUsed?.output}
      turns-used={result()?.turnsUsed}
      duration-ms={result()?.durationMs}
    >
      {props.children}
    </claude>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { ClaudeProps, AgentResult }
export { executeClaudeCLI } from './agents/ClaudeCodeCLI'
