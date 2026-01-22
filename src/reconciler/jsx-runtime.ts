import type { ElementType, JSX as ReactJSX, Key } from 'react'
import {
  Fragment,
  jsx as reactJsx,
  jsxs as reactJsxs,
} from 'react/jsx-runtime'

let reactJsxDEV: typeof import('react/jsx-dev-runtime').jsxDEV | undefined
try {
  const devRuntime = require('react/jsx-dev-runtime') as typeof import('react/jsx-dev-runtime')
  reactJsxDEV = devRuntime.jsxDEV
} catch {}

type Props = Record<string, unknown> | null

function withSmithersKey(props: Props, key: Key | undefined): Props {
  if (key == null) return props
  const nextProps = props ? { ...props } : {}
  nextProps['__smithersKey'] = key
  return nextProps
}

export function jsx(
  type: ReactJSX.ElementType,
  props: Props,
  key?: Key
) {
  return reactJsx(type as ElementType, withSmithersKey(props, key), key)
}

export function jsxs(
  type: ReactJSX.ElementType,
  props: Props,
  key?: Key
) {
  return reactJsxs(type as ElementType, withSmithersKey(props, key), key)
}

export function jsxDEV(
  type: ReactJSX.ElementType,
  props: Props,
  key: Key | undefined,
  isStaticChildren: boolean,
  source: { fileName: string; lineNumber: number; columnNumber: number } | undefined,
  self: unknown
) {
  if (!reactJsxDEV) return reactJsx(type as ElementType, withSmithersKey(props, key), key)
  return reactJsxDEV(type as ElementType, withSmithersKey(props, key), key, isStaticChildren, source, self)
}

export { Fragment }
export type { SmithersNode } from './types.js'
