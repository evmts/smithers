import type { ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMount } from '../reconciler/hooks.js'
import { PlanNodeProvider, usePlanNodeProps } from './PlanNodeContext.js'

export interface StopProps {
  reason?: string
  children?: ReactNode
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
export function Stop(props: StopProps): ReactNode {
  const { requestStop } = useSmithers()
  const { nodeId, planNodeProps } = usePlanNodeProps()

  useMount(() => {
    requestStop(props.reason ?? 'Stop component rendered')
  })

  return (
    <PlanNodeProvider nodeId={nodeId}>
      <smithers-stop reason={props.reason} {...planNodeProps}>
        {props.children}
      </smithers-stop>
    </PlanNodeProvider>
  )
}
