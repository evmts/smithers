// Parallel - Execute children concurrently
// When placed inside a Phase, all child Steps/Claude components execute simultaneously

import type { ReactNode } from 'react'
import { StepRegistryProvider } from './Step.js'
import { PlanNodeProvider, usePlanNodeProps } from './PlanNodeContext.js'

export interface ParallelProps {
  /**
   * Children to execute in parallel
   */
  children: ReactNode
}

/**
 * Parallel execution wrapper
 *
 * By default, Steps within a Phase execute sequentially.
 * Wrap them in Parallel to execute concurrently.
 *
 * @example
 * ```tsx
 * <Phase name="Build">
 *   <Parallel>
 *     <Step name="Frontend"><Claude>Build frontend...</Claude></Step>
 *     <Step name="Backend"><Claude>Build backend...</Claude></Step>
 *   </Parallel>
 * </Phase>
 * ```
 */
export function Parallel(props: ParallelProps): ReactNode {
  const { nodeId, planNodeProps } = usePlanNodeProps()
  // Wrap children in StepRegistryProvider with isParallel to enable concurrent execution
  // The <parallel> intrinsic element marks this in the output tree
  return (
    <PlanNodeProvider nodeId={nodeId}>
      <parallel {...planNodeProps}>
        <StepRegistryProvider isParallel>
          {props.children}
        </StepRegistryProvider>
      </parallel>
    </PlanNodeProvider>
  )
}
