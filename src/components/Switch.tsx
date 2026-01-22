import { type ReactNode, type ReactElement, Children, isValidElement, useRef } from 'react'
import { useMountedState, useMount } from '../reconciler/hooks.js'
import { useSmithers } from './SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/hooks/useQueryValue.js'

export interface SwitchProps<T = unknown> {
  id: string
  value: T | (() => T) | (() => Promise<T>)
  serialize?: (value: T) => string
  deserialize?: (raw: string) => T
  children: ReactNode
}

export interface CaseProps<T = unknown> {
  match: T | T[]
  children: ReactNode
}

export interface DefaultProps {
  children: ReactNode
}

export function Case<T>(_props: CaseProps<T>): ReactElement | null {
  return null
}

export function Default(_props: DefaultProps): ReactElement | null {
  return null
}

interface SwitchState {
  resolved: boolean
  value?: unknown
  error?: string
}

export function Switch<T>({ id, value, children }: SwitchProps<T>): ReactNode {
  const { db } = useSmithers()
  const isMounted = useMountedState()
  const hasStartedRef = useRef(false)
  
  const stateKey = `switch.${id}.state`
  
  const { data: stateJson } = useQueryValue<string>(
    db.db,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )
  
  const switchState: SwitchState = stateJson 
    ? JSON.parse(stateJson) 
    : { resolved: false }

  useMount(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    
    const resolveValue = async () => {
      try {
        let val: T
        if (typeof value === 'function') {
          val = await (value as () => T | Promise<T>)()
        } else {
          val = value
        }
        if (isMounted()) {
          db.state.set<SwitchState>(stateKey, { resolved: true, value: val }, 'switch_resolve')
        }
      } catch (err) {
        if (isMounted()) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          db.state.set<SwitchState>(stateKey, { resolved: true, error: errorMessage }, 'switch_error')
        }
      }
    }
    resolveValue()
  })

  if (!switchState.resolved) {
    return null
  }

  if (switchState.error) {
    throw new Error(`Switch[${id}] value resolution failed: ${switchState.error}`)
  }

  const actualValue = switchState.value as T

  let matchedCase: ReactElement | null = null
  let defaultCase: ReactElement | null = null

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return

    if (child.type === Default) {
      defaultCase = (child.props as DefaultProps).children as ReactElement
      return
    }

    if (child.type === Case && !matchedCase) {
      const caseProps = child.props as unknown as CaseProps<T>
      const matchValues = Array.isArray(caseProps.match) ? caseProps.match : [caseProps.match]
      
      if (matchValues.includes(actualValue)) {
        matchedCase = caseProps.children as ReactElement
      }
    }
  })

  return matchedCase ?? defaultCase ?? null
}
