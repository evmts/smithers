/**
 * SolidJS Client Build Shim
 *
 * This module ensures we always use the SolidJS client build which has reactivity enabled.
 * The default Node/worker export condition uses the server build which disables reactivity.
 *
 * By re-exporting from solid-js/dist/solid.js directly, we bypass the conditional exports
 * and always get the reactive client build.
 */

// Import from dist to get browser build with reactivity (see solid-dist.d.ts)
export {
  createSignal,
  createEffect,
  createMemo,
  createRoot,
  createRenderEffect,
  createComponent,
  mergeProps,
  splitProps,
  untrack,
  batch,
  on,
  onMount,
  onCleanup,
  onError,
  getOwner,
  runWithOwner,
  children,
  // Note: Show, For, Switch, Match, Index are NOT exported here
  // We have custom implementations in control-flow.tsx for Smithers tree rendering
} from 'solid-js/dist/solid.js'

// Re-export types from solid-js (types are the same for both builds)
export type { Accessor, Setter, Signal, Component, JSX } from 'solid-js'
