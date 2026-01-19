import type { ReactNode } from 'react'
import { useRef } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMount, useEffectOnValueChange } from '../reconciler/hooks.js'
import { useQueryOne } from '../reactive-sqlite/index.js'
import type { HumanInteraction } from '../db/human.js'
import { PlanNodeProvider, usePlanNodeProps } from './PlanNodeContext.js'

export interface HumanProps {
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
  const taskIdRef = useRef<string | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const { nodeId, planNodeProps } = usePlanNodeProps()

  useMount(() => {
    // Register blocking task
    taskIdRef.current = db.tasks.start('human_interaction', props.message ?? 'Human input required')

    // Create human interaction request
    requestIdRef.current = db.human.request(
      'confirmation',
      props.message ?? 'Approve to continue'
    )
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
    <PlanNodeProvider nodeId={nodeId}>
      <human message={props.message} {...planNodeProps}>
        {props.children}
      </human>
    </PlanNodeProvider>
  )
}
