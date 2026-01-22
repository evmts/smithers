import type { ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMount } from '../reconciler/hooks.js'

export interface StopProps {
  reason?: string
  children?: ReactNode
}

export function Stop(props: StopProps): ReactNode {
  const { requestStop } = useSmithers()

  useMount(() => {
    requestStop(props.reason ?? 'Stop component rendered')
  })

  return (
    <smithers-stop reason={props.reason}>
      {props.children}
    </smithers-stop>
  )
}
