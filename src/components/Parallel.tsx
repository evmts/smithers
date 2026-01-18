// Parallel - Execute children concurrently
// When placed inside a Phase, all child Steps/Claude components execute simultaneously

import type { ReactNode } from 'react'

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
  // Simply render all children - they execute in parallel by React's nature
  // The <parallel> intrinsic element marks this in the output tree
  return (
    <parallel>
      {props.children}
    </parallel>
  )
}
