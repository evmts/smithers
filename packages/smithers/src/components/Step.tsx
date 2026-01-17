import type { JSX } from 'solid-js'

export interface StepProps {
  children?: JSX.Element
}

/**
 * Step component - semantic wrapper for individual steps within a phase.
 *
 * Steps are the smallest organizational unit. They have no execution logic -
 * just semantic XML tags for clarity in plans.
 *
 * @example
 * ```tsx
 * <Phase name="research">
 *   <Step>
 *     <Claude>Find academic papers</Claude>
 *   </Step>
 *   <Step>
 *     <Claude>Summarize findings</Claude>
 *   </Step>
 * </Phase>
 * ```
 */
export function Step(props: StepProps) {
  return <step>{props.children}</step>
}
