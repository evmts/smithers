import type { ReactNode } from 'react'
import { useRef } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useExecutionScope } from './ExecutionScope.js'
import { useMount } from '../reconciler/hooks.js'

export interface EndSummary {
  /** Overall status */
  status: 'success' | 'failure' | 'partial'

  /** Human-readable summary */
  message: string

  /** Structured data for downstream consumers */
  data?: Record<string, unknown>

  /** Metrics */
  metrics?: {
    duration_ms?: number
    iterations?: number
    agents_run?: number
    tokens_used?: { input: number; output: number }
  }
}

export interface EndProps {
  /** Structured summary of the run (stored in DB, available for notifications) */
  summary: EndSummary | (() => EndSummary | Promise<EndSummary>)

  /** Exit code for process (default: 0 for success) */
  exitCode?: number

  /** Optional reason for ending */
  reason?: 'success' | 'failure' | 'max_iterations' | 'user_cancelled' | string
}

/**
 * End component - explicitly terminates orchestration and captures structured summary.
 *
 * When rendered, it:
 * 1. Evaluates the summary (sync or async)
 * 2. Stores summary in executions table
 * 3. Calls requestStop() to halt Ralph loop
 * 4. Process exits with exitCode
 *
 * @example
 * ```tsx
 * <End
 *   summary={{
 *     status: 'success',
 *     message: 'PR #123 review completed',
 *     data: { iterations: 2, approved: true },
 *   }}
 * />
 * ```
 *
 * @example Dynamic summary
 * ```tsx
 * <End
 *   summary={async () => {
 *     const review = await db.state.get('lastReview')
 *     return {
 *       status: review?.approved ? 'success' : 'failure',
 *       message: review?.approved ? 'Approved' : 'Changes requested',
 *     }
 *   }}
 * />
 * ```
 */
export function End(props: EndProps): ReactNode {
  const { db, executionId, requestStop } = useSmithers()
  const executionScope = useExecutionScope()
  const taskIdRef = useRef<string | null>(null)
  const hasEndedRef = useRef(false)

  useMount(() => {
    if (hasEndedRef.current) return
    hasEndedRef.current = true

    ;(async () => {
      taskIdRef.current = db.tasks.start('end', 'orchestration', { scopeId: executionScope.scopeId })

      try {
        // Evaluate summary
        const summary =
          typeof props.summary === 'function'
            ? await props.summary()
            : props.summary

        const reason =
          props.reason ?? (summary.status === 'success' ? 'success' : 'failure')
        const exitCode =
          props.exitCode ?? (summary.status === 'success' ? 0 : 1)

        // Store in DB
        db.db.run(
          `
          UPDATE executions 
          SET end_summary = ?, end_reason = ?, exit_code = ?, status = 'completed'
          WHERE id = ?
        `,
          [JSON.stringify(summary), reason, exitCode, executionId]
        )

        // Signal stop
        requestStop(`End: ${summary.message}`)

        db.tasks.complete(taskIdRef.current!)
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
        const fallbackSummary: EndSummary = {
          status: 'failure',
          message: `End failed: ${errorObj.message}`,
          data: { error: errorObj.message },
        }
        db.db.run(
          `
          UPDATE executions 
          SET end_summary = ?, end_reason = ?, exit_code = ?, status = 'failed'
          WHERE id = ?
        `,
          [
            JSON.stringify(fallbackSummary),
            props.reason ?? 'failure',
            props.exitCode ?? 1,
            executionId,
          ]
        )
        requestStop(`End failed: ${errorObj.message}`)
      }
    })()
  })

  const reason =
    props.reason ??
    (typeof props.summary === 'function'
      ? 'pending'
      : props.summary.status === 'success'
        ? 'success'
        : 'failure')

  return (
    <end status="ending" reason={reason} exitCode={props.exitCode ?? 0} />
  )
}
