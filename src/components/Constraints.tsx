import type { JSX } from 'solid-js'

export interface ConstraintsProps {
  children?: JSX.Element
  [key: string]: unknown
}

/**
 * Constraints component - defines constraints for Claude's responses.
 *
 * Constraints are added to the prompt to guide Claude's behavior.
 *
 * @example
 * ```tsx
 * <Claude>
 *   <Constraints>
 *     - Keep responses concise
 *     - Focus on security
 *     - Cite sources
 *   </Constraints>
 *   Analyze this code
 * </Claude>
 * ```
 */
export function Constraints(props: ConstraintsProps): JSX.Element {
  return (
    <constraints>
      {props.children}
    </constraints>
  )
}
