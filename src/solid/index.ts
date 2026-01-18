/**
 * Solid.js renderer for Smithers
 */

export { createSmithersRoot } from './root.js'

// Export all renderer functions for babel-preset-solid universal mode
export {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  use,
} from './renderer.js'

// Re-export Solid primitives for convenience
export {
  createSignal,
  createEffect,
  createMemo,
  createRoot,
  batch,
  untrack,
  on,
  onMount,
  onCleanup,
  type Accessor,
  type Setter,
} from 'solid-js'
