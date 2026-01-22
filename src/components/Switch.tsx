import { type ReactNode, type ReactElement, Children, isValidElement, useRef, useState, useEffect } from 'react'
import { useMountedState } from '../reconciler/hooks.js'

export interface SwitchProps<T = unknown> {
  id?: string
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

interface ResolvedState<T> {
  resolved: boolean
  value?: T
}

export function Switch<T>({ value, children }: SwitchProps<T>): ReactNode {
  const isMounted = useMountedState()
  const resolvedRef = useRef<ResolvedState<T>>({ resolved: false })
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const resolveValue = async () => {
      let val: T
      if (typeof value === 'function') {
        val = await (value as () => T | Promise<T>)()
      } else {
        val = value
      }
      if (isMounted()) {
        resolvedRef.current = { resolved: true, value: val }
        forceUpdate(n => n + 1)
      }
    }
    resolveValue()
  }, [value, isMounted])

  if (!resolvedRef.current.resolved) {
    return null
  }

  const actualValue = resolvedRef.current.value as T

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
