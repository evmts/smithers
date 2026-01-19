import type { ReactNode } from 'react'
import { useRef } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMount, useEffectOnValueChange } from '../reconciler/hooks.js'
import { useQueryOne } from '../reactive-sqlite/index.js'
import type { HumanInteraction } from '../db/human.js'

export interface HumanProps {
  /**
   * Stable identifier for resumability. Required for crash-resume.
   * Must be deterministic across restarts - no random IDs.
   */
  id?: string
  message?: string
  onApprove?: () => void
  onReject?: () => void
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Human component - pauses execution for human interaction.
 *
 * When the execution loop encounters a Human node, it pauses
 * and waits for human approval/rejection before continuing.
 *
 * @example
 * ```tsx
 * <Human
 *   message="Approve deployment?"
 *   onApprove={() => setApproved(true)}
 *   onReject={() => setRejected(true)}
 * >
 *   About to deploy to production
 * </Human>
 * ```
 */
export function Human(props: HumanProps): ReactNode {
  const { db } = useSmithers()
  // Use stable id for resumability (falls back to random if not provided)
  const humanId = props.id ?? crypto.randomUUID()
  const stateKey = `human:${humanId}`
  const taskIdRef = useRef<string | null>(null)
  const requestIdRef = useRef<string | null>(null)

  useMount(() => {
    // Check for existing request (resumability)
    const existingRequestId = db.state.get<string>(stateKey)
    if (existingRequestId) {
      requestIdRef.current = existingRequestId
      // Don't start a new task if resuming
      return
    }

    // Register blocking task
    taskIdRef.current = db.tasks.start('human_interaction', props.message ?? 'Human input required')

    // Create human interaction request
    requestIdRef.current = db.human.request(
      'confirmation',
      props.message ?? 'Approve to continue'
    )

    // Store request id for resumability
    db.state.set(stateKey, requestIdRef.current, 'human_request')
  })

  // Reactive subscription to the request
  const { data: request } = useQueryOne<HumanInteraction>(
    db.db,
    requestIdRef.current
      ? `SELECT * FROM human_interactions WHERE id = ?`
      : `SELECT 1 WHERE 0`,
    requestIdRef.current ? [requestIdRef.current] : []
  )

  // Handle resolution
  useEffectOnValueChange(request?.status, () => {
    if (!request || request.status === 'pending') return

    // Complete task to unblock orchestration
    if (taskIdRef.current) {
      db.tasks.complete(taskIdRef.current)
      taskIdRef.current = null
    }

    // Fire callbacks
    if (request.status === 'approved') {
      props.onApprove?.()
    } else {
      props.onReject?.()
    }
  })

  return (
    <human message={props.message}>
      {props.children}
    </human>
  )
}
