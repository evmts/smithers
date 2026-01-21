import type { ReactNode } from 'react'
import { While, type WhileProps } from './While.js'

export interface RalphProps extends WhileProps {}

export function Ralph(props: RalphProps): ReactNode {
  return <While {...props} />
}

export { useWhileIteration as useRalphIteration } from './While.js'
