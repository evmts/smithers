import type { JSX } from 'solid-js'

export interface PhaseProps {
  name?: string
  children?: JSX.Element
  [key: string]: unknown
}

/**
 * Phase component - groups steps semantically.
 * Provides semantic structure to agent workflows.
 */
export function Phase(props: PhaseProps): JSX.Element {
  const { children, ...rest } = props
  return (
    <phase {...rest}>
      {children}
    </phase>
  )
}
