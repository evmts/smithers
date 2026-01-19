import type { ReactNode } from 'react'
import { PlanNodeProvider, usePlanNodeProps } from './PlanNodeContext.js'

export interface TaskProps {
  done?: boolean
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Task component - represents a trackable task.
 *
 * Tasks can be marked as done/not done to track progress.
 *
 * @example
 * ```tsx
 * <Phase name="work">
 *   <Task done={false}>Research topic</Task>
 *   <Task done={true}>Write outline</Task>
 *   <Task done={false}>Write draft</Task>
 * </Phase>
 * ```
 */
export function Task(props: TaskProps): ReactNode {
  const { nodeId, planNodeProps } = usePlanNodeProps()
  return (
    <PlanNodeProvider nodeId={nodeId}>
      <task done={props.done} {...planNodeProps}>
        {props.children}
      </task>
    </PlanNodeProvider>
  )
}
