import type { JSX } from 'solid-js'

export interface TaskProps {
  done?: boolean
  children?: JSX.Element
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
export function Task(props: TaskProps): JSX.Element {
  return (
    <task done={props.done}>
      {props.children}
    </task>
  )
}
