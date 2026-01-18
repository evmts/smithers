/**
 * Solid.js renderer for Smithers
 */

export { createSmithersRoot } from './root.js'
export { render, effect, memo, createComponent } from './renderer.jsx'

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
