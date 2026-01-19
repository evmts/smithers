import type { ReactNode } from 'react'

export interface EachProps<T> {
  items: T[]
  children: (item: T, index: number) => ReactNode
}

export function Each<T>({ items, children }: EachProps<T>): ReactNode {
  return <>{items.map((item, index) => children(item, index))}</>
}
