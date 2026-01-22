import type { ReactNode } from 'react'

export interface ConstraintsProps {
  children?: ReactNode
}

export function Constraints(props: ConstraintsProps): ReactNode {
  return (
    <constraints>
      {props.children}
    </constraints>
  )
}
