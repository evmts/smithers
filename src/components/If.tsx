import type { ReactNode } from 'react'

export interface IfProps {
  condition: unknown
  children: ReactNode
}

export function If({ condition, children }: IfProps): ReactNode {
  return condition ? children : null
}
