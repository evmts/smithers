/**
 * Smithers - Build AI agents with Solid.js
 *
 * A declarative JSX framework for Claude orchestration using Solid's
 * fine-grained reactivity. Components execute on mount, signals drive
 * the workflow, and Ralph keeps the loop going.
 *
 * @packageDocumentation
 */

// Core
export { createSmithersRoot, type SmithersRoot } from './root.js'
export { serialize } from './serialize.js'
export type { SmithersNode } from './types.js'

// Components
export { Claude, type ClaudeProps } from './components/Claude.js'
export { Ralph, type RalphProps, RalphContext } from './components/Ralph.js'
export { Phase, type PhaseProps } from './components/Phase.js'
export { Step, type StepProps } from './components/Step.js'

// Re-export Solid primitives for convenience
export {
  createSignal,
  createEffect,
  createMemo,
  createRoot,
  batch,
  onMount,
  onCleanup,
  type Accessor,
  type Setter,
} from './solid-shim.js'
