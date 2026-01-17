import type { JSX } from 'solid-js'

export interface PhaseProps {
  name: string
  children?: JSX.Element
}

/**
 * Phase component - semantic wrapper for grouping steps.
 *
 * Phases are organizational units that help structure complex agent workflows.
 * They have no execution logic - just semantic XML tags.
 *
 * @example
 * ```tsx
 * <Phase name="research">
 *   <Claude>Find sources about AI agents</Claude>
 * </Phase>
 * ```
 */
export function Phase(props: PhaseProps) {
  return <phase name={props.name}>{props.children}</phase>
}
