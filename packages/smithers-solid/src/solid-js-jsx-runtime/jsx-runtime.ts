import type { JSX } from 'solid-js'
import { smithersRenderer } from '../renderer.js'
import type { SmithersNode } from '../renderer.js'

const { createComponent, createElement, insert, setProp } = smithersRenderer

function applyProps(node: ReturnType<typeof createElement>, props?: Record<string, unknown>) {
  if (!props) return
  for (const key of Object.keys(props)) {
    if (key === 'children') continue
    setProp(node, key, props[key])
  }
}

function applyChildren(node: ReturnType<typeof createElement>, props?: Record<string, unknown> & { children?: unknown }) {
  if (props?.children !== undefined) {
    insert(node, props.children)
  }
}

type SmithersComponent = (props: Record<string, unknown> & { children?: unknown }) => SmithersNode

export function jsx(
  type: string | SmithersComponent,
  props?: Record<string, unknown> & { children?: unknown }
) {
  if (typeof type === 'function') {
    return createComponent(type, props ?? {})
  }

  const element = createElement(type)
  applyProps(element, props)
  applyChildren(element, props)
  return element
}

export const jsxs = jsx
export const jsxDEV = jsx

export const Fragment = (props: { children?: JSX.Element | JSX.Element[] | undefined }) => props.children
