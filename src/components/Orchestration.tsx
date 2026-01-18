// Orchestration - Top-level orchestration component
// Handles global timeouts, stop conditions, CI/CD integration, and cleanup

import { useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider'
import { jjSnapshot } from '../utils/vcs'
import { useMount, useUnmount } from '../reconciler/hooks'

// ============================================================================
// TYPES
// ============================================================================

export interface GlobalStopCondition {
  type: 'total_tokens' | 'total_agents' | 'total_time' | 'report_severity' | 'ci_failure' | 'custom'
  value?: number | string
  fn?: (context: OrchestrationContext) => boolean | Promise<boolean>
  message?: string
}

export interface OrchestrationContext {
  executionId: string
  totalTokens: number
  totalAgents: number
  totalToolCalls: number
  elapsedTimeMs: number
}

export interface OrchestrationResult {
  executionId: string
  status: 'completed' | 'stopped' | 'failed' | 'cancelled'
  totalAgents: number
  totalToolCalls: number
  totalTokens: number
  durationMs: number
}

export interface OrchestrationProps {
  /**
   * Children components
   */
  children: ReactNode

  /**
   * Global timeout in milliseconds
   */
  globalTimeout?: number

  /**
   * Global stop conditions
   */
  stopConditions?: GlobalStopCondition[]

  /**
   * Create JJ snapshot before starting
   */
  snapshotBeforeStart?: boolean

  /**
   * Callback when orchestration completes
   */
  onComplete?: (result: OrchestrationResult) => void

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void

  /**
   * Callback when stop is requested
   */
  onStopRequested?: (reason: string) => void

  /**
   * Cleanup on complete (close DB, etc.)
   */
  cleanupOnComplete?: boolean
}

/**
 * Orchestration component
 *
 * Usage:
 * ```tsx
 * <Orchestration
 *   globalTimeout={1800000}
 *   snapshotBeforeStart
 *   stopConditions={[
 *     { type: 'total_tokens', value: 500000, message: 'Token budget exceeded' }
 *   ]}
 * >
 *   <Ralph maxIterations={10}>
 *     ...
 *   </Ralph>
 * </Orchestration>
 * ```
 */
export function Orchestration(props: OrchestrationProps): ReactNode {
  const { db, executionId, requestStop, isStopRequested } = useSmithers()

  const startTimeRef = useRef(Date.now())
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkIntervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useMount(() => {
    const startTime = startTimeRef.current

    ;(async () => {
      try {
        // Create snapshot if requested
        if (props.snapshotBeforeStart) {
          try {
            const { changeId, description } = await jjSnapshot('Before orchestration start')
            await db.vcs.logSnapshot({
              change_id: changeId,
              description,
            })
            console.log(`[Orchestration] Created initial snapshot: ${changeId}`)
          } catch (error) {
            // JJ might not be available, that's okay
            console.warn('[Orchestration] Could not create JJ snapshot:', error)
          }
        }

        // Set up global timeout
        if (props.globalTimeout) {
          timeoutIdRef.current = setTimeout(() => {
            if (!isStopRequested()) {
              const message = `Global timeout of ${props.globalTimeout}ms exceeded`
              requestStop(message)
              props.onStopRequested?.(message)
            }
          }, props.globalTimeout)
        }

        // Set up stop condition checking
        if (props.stopConditions && props.stopConditions.length > 0) {
          checkIntervalIdRef.current = setInterval(async () => {
            if (isStopRequested()) {
              if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)
              return
            }

            const execution = await db.execution.current()
            if (!execution) return

            const context: OrchestrationContext = {
              executionId,
              totalTokens: execution.total_tokens_used,
              totalAgents: execution.total_agents,
              totalToolCalls: execution.total_tool_calls,
              elapsedTimeMs: Date.now() - startTime,
            }

            for (const condition of props.stopConditions!) {
              let shouldStop = false
              let message = condition.message ?? 'Stop condition met'

              switch (condition.type) {
                case 'total_tokens':
                  shouldStop = context.totalTokens >= (condition.value as number)
                  message = message || `Token limit ${condition.value} exceeded`
                  break

                case 'total_agents':
                  shouldStop = context.totalAgents >= (condition.value as number)
                  message = message || `Agent limit ${condition.value} exceeded`
                  break

                case 'total_time':
                  shouldStop = context.elapsedTimeMs >= (condition.value as number)
                  message = message || `Time limit ${condition.value}ms exceeded`
                  break

                case 'report_severity':
                  const criticalReports = await db.vcs.getCriticalReports()
                  shouldStop = criticalReports.length > 0
                  message = message || `Critical report(s) found: ${criticalReports.length}`
                  break

                case 'custom':
                  if (condition.fn) {
                    shouldStop = await condition.fn(context)
                  }
                  break
              }

              if (shouldStop) {
                console.log(`[Orchestration] Stop condition met: ${message}`)
                requestStop(message)
                props.onStopRequested?.(message)

                if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)
                break
              }
            }
          }, 1000) // Check every second
        }
      } catch (error) {
        console.error('[Orchestration] Setup error:', error)
        props.onError?.(error as Error)
      }
    })()
  })

  useUnmount(() => {
    // Clear timers
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
    if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)

    // Generate completion result
    ;(async () => {
      try {
        const execution = await db.execution.current()
        if (!execution) return

        const result: OrchestrationResult = {
          executionId,
          status: isStopRequested() ? 'stopped' : 'completed',
          totalAgents: execution.total_agents,
          totalToolCalls: execution.total_tool_calls,
          totalTokens: execution.total_tokens_used,
          durationMs: Date.now() - startTimeRef.current,
        }

        props.onComplete?.(result)

        // Cleanup if requested
        if (props.cleanupOnComplete) {
          await db.close()
        }
      } catch (error) {
        console.error('[Orchestration] Cleanup error:', error)
        props.onError?.(error as Error)
      }
    })()
  })

  return <orchestration execution-id={executionId}>{props.children}</orchestration>
}
