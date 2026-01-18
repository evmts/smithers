import type { JSX } from 'solid-js'

export interface HumanProps {
  message?: string
  onApprove?: () => void
  onReject?: () => void
  children?: JSX.Element
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
export function Human(props: HumanProps): JSX.Element {
  return (
    <human message={props.message}>
      {props.children}
    </human>
  )
}
