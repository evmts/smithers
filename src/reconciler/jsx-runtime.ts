/**
 * JSX Runtime for Smithers - delegates to React while surfacing key props.
 * React handles component calls + hook dispatcher setup.
 * Our hostConfig transforms React elements → SmithersNode trees.
 */
import type { JSX as ReactJSX } from 'react'
import {
  Fragment,
  jsx as reactJsx,
  jsxs as reactJsxs,
} from 'react/jsx-runtime'
import { jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime'

type Props = Record<string, unknown> | null

function withSmithersKey(props: Props, key: React.Key | undefined): Props {
  if (key == null) return props
  const nextProps = props ? { ...props } : {}
  nextProps['__smithersKey'] = key
  return nextProps
}

export function jsx(
  type: ReactJSX.ElementType,
  props: Props,
  key?: React.Key
) {
  return reactJsx(type as React.ElementType, withSmithersKey(props, key), key)
}

export function jsxs(
  type: ReactJSX.ElementType,
  props: Props,
  key?: React.Key
) {
  return reactJsxs(type as React.ElementType, withSmithersKey(props, key), key)
}

export function jsxDEV(
  type: ReactJSX.ElementType,
  props: Props,
  key: React.Key | undefined,
  isStaticChildren: boolean,
  source: { fileName: string; lineNumber: number; columnNumber: number } | undefined,
  self: unknown
) {
  return reactJsxDEV(type as React.ElementType, withSmithersKey(props, key), key, isStaticChildren, source, self)
}

export { Fragment }
export type { SmithersNode } from './types.js'
