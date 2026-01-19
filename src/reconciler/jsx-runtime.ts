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

// In production mode, jsxDEV is undefined - fallback to jsx.
// Avoid top-level await to reduce bundler/runtime fragility.
let reactJsxDEV: typeof import('react/jsx-dev-runtime').jsxDEV | undefined
if (process.env.NODE_ENV !== 'production') {
  void import('react/jsx-dev-runtime')
    .then((devRuntime) => {
      reactJsxDEV = devRuntime.jsxDEV
    })
    .catch(() => {
      // Fallback handled below
    })
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
