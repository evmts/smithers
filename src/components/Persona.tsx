import type { JSX } from 'solid-js'

export interface PersonaProps {
  role?: string
  children?: JSX.Element
  [key: string]: unknown
}

/**
 * Persona component - defines a persona/role for Claude.
 *
 * Personas are typically rendered as part of the system message
 * when executing a Claude component.
 *
 * @example
 * ```tsx
 * <Claude>
 *   <Persona role="security expert">
 *     You specialize in application security and code review.
 *   </Persona>
 *   Review this code for vulnerabilities.
 * </Claude>
 * ```
 */
export function Persona(props: PersonaProps): JSX.Element {
  return (
    <persona role={props.role}>
      {props.children}
    </persona>
  )
}
