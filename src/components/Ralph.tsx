import type { ReactNode } from 'react'
import { useRef } from 'react'
import { While, type WhileProps, DEFAULT_MAX_ITERATIONS } from './While.js'

export interface RalphProps {
  id?: string
  condition?: () => boolean | Promise<boolean>
  maxIterations?: number
  children: ReactNode
  onIteration?: (iteration: number) => void
  onComplete?: (iterations: number, reason: 'condition' | 'max') => void
}

let ralphIdCounter = 0

export function Ralph(props: RalphProps): ReactNode {
  const idRef = useRef<string>(props.id ?? `ralph-${++ralphIdCounter}`)
  
  const whileProps: WhileProps = {
    id: idRef.current,
    condition: props.condition ?? (() => true),
    maxIterations: props.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    children: props.children,
    onIteration: props.onIteration,
    onComplete: props.onComplete,
  }
  
  return <While {...whileProps} />
}

export { useWhileIteration as useRalphIteration } from './While.js'
