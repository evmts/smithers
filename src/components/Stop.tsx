import type { JSX } from 'solid-js'

export interface StopProps {
  reason?: string
  children?: JSX.Element
  [key: string]: unknown
}

/**
 * Stop component - signals that execution should halt.
 *
 * When the Ralph Wiggum loop encounters a Stop node in the tree,
 * it stops iterating and returns the current result.
 *
 * @example
 * ```tsx
 * <Claude onFinished={() => setDone(true)}>
 *   Do work
 * </Claude>
 * {done && <Stop reason="Work complete" />}
 * ```
 */
export function Stop(props: StopProps): JSX.Element {
  return (
    <smithers-stop reason={props.reason}>
      {props.children}
    </smithers-stop>
  )
}
