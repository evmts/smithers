/**
 * JSX Runtime for Smithers - delegates to React while surfacing key props.
 * React handles component calls + hook dispatcher setup.
 * Our hostConfig transforms React elements → SmithersNode trees.
 */
import type { ElementType, JSX as ReactJSX, Key } from 'react'
import {
  Fragment,
  jsx as reactJsx,
  jsxs as reactJsxs,
} from 'react/jsx-runtime'

// In production mode, jsxDEV may be undefined - fallback to jsx.
// Use synchronous require to avoid race conditions with async import.
let reactJsxDEV: typeof import('react/jsx-dev-runtime').jsxDEV | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const devRuntime = require('react/jsx-dev-runtime') as typeof import('react/jsx-dev-runtime')
  reactJsxDEV = devRuntime.jsxDEV
} catch {
  // Fallback handled in jsxDEV function
}

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
  // Fallback to jsx in production mode where jsxDEV is undefined
  if (!reactJsxDEV) {
    return reactJsx(type as ElementType, withSmithersKey(props, key), key)
  }
  return reactJsxDEV(type as ElementType, withSmithersKey(props, key), key, isStaticChildren, source, self)
}

export { Fragment }
export type { SmithersNode } from './types.js'
