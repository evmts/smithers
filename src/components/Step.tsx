import type { JSX } from 'solid-js'

export interface StepProps {
  name?: string
  children?: JSX.Element
  [key: string]: unknown
}

/**
 * Step component - represents a single step within a phase.
 * Provides semantic structure to agent workflows.
 */
export function Step(props: StepProps): JSX.Element {
  return (
    <step name={props.name}>
      {props.children}
    </step>
  )
}
