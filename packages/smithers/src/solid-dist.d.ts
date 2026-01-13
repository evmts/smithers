/**
 * Type declarations for solid-js/dist/solid.js
 *
 * This is the direct path to SolidJS's browser build which includes reactivity.
 * We import from here to bypass conditional exports which would give us the
 * server build (no reactivity) in Node.js environments.
 */
declare module 'solid-js/dist/solid.js' {
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
    // Note: Show, For, Switch, Match, Index have custom implementations
    // in control-flow.tsx for Smithers tree rendering
  } from 'solid-js'
}
