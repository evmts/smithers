import type { ReactNode } from 'react'

export interface SubagentProps {
  name?: string
  parallel?: boolean
  children?: ReactNode
}

export function Subagent(props: SubagentProps): ReactNode {
  return (
    <subagent name={props.name} parallel={props.parallel}>
      {props.children}
    </subagent>
  )
}
