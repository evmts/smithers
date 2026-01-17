import type { JSX } from 'solid-js'

export interface PhaseProps {
  name: string
  children?: JSX.Element
}

/**
 * Phase component - groups steps semantically
 */
export function Phase(props: PhaseProps): JSX.Element {
  return props as unknown as JSX.Element
}
