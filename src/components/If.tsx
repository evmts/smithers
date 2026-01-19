import type { ReactNode } from 'react'

/**
 * Conditional rendering component
 *
 * Renders children only when condition is true.
 * Cleaner alternative to `{condition && (<Component />)}`
 *
 * @example
 * ```tsx
 * <If condition={phase === "implement"}>
 *   <Phase name="Implementation">
 *     <Claude>Implement the feature.</Claude>
 *   </Phase>
 * </If>
 * ```
 */
export interface IfProps {
  /** Condition to evaluate */
  condition: boolean
  /** Content to render when condition is true */
  children: ReactNode
}

export function If({ condition, children }: IfProps): ReactNode {
  return condition ? children : null
}
