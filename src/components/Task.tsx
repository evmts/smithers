import type { ReactNode } from 'react'

export interface TaskProps {
  done?: boolean
  children?: ReactNode
}

export function Task(props: TaskProps): ReactNode {
  return (
    <task done={props.done}>
      {props.children}
    </task>
  )
}
