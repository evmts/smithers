// Parallel - Execute children concurrently
// When placed inside a Phase, all child Steps/Claude components execute simultaneously

import type { ReactNode } from 'react'
import { StepRegistryProvider } from './Step.js'

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
  // Wrap children in StepRegistryProvider with isParallel to enable concurrent execution
  // The <parallel> intrinsic element marks this in the output tree
  return (
    <parallel>
      <StepRegistryProvider isParallel>
        {props.children}
      </StepRegistryProvider>
    </parallel>
  )
}
