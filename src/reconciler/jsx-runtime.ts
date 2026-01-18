/**
 * JSX Runtime for Smithers - delegates to React
 * React handles component calls + hook dispatcher setup
 * Our hostConfig transforms React elements → SmithersNode trees
 */
export { jsx, jsxs, Fragment } from 'react/jsx-runtime'
export { jsxDEV } from 'react/jsx-dev-runtime'
export type { SmithersNode } from './types.js'
