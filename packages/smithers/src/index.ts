/**
 * @evmts/smithers-solid
 *
 * Solid.js renderer for Smithers - Build AI agents with JSX
 *
 * This package provides a Solid-based alternative to the React renderer
 * in @evmts/smithers. It produces identical XML plan output, allowing
 * agents to be authored with Solid's signal-based reactivity.
 *
 * @example
 * ```tsx
 * import { createSignal } from 'solid-js'
 * import { Claude, Phase, createSmithersSolidRoot, serialize } from '@evmts/smithers-solid'
 *
 * function MyAgent() {
 *   const [phase, setPhase] = createSignal<'research' | 'write'>('research')
 *
 *   return phase() === 'research'
 *     ? <Claude onFinished={() => setPhase('write')}>Research the topic</Claude>
 *     : <Claude>Write the report</Claude>
 * }
 *
 * const root = createSmithersSolidRoot()
 * root.mount(MyAgent)
 *
 * const tree = root.getTree()
 * const xml = serialize(tree)
 * console.log(xml)
 *
 * root.dispose()
 * ```
 *
 * @packageDocumentation
 */

// Core renderer
export {
  createSmithersSolidRenderer,
  smithersRenderer,
  render,
  effect,
  memo,
  createComponent,
  type SmithersNode,
  type ExecutionState,
} from './renderer.js'

// Root factory
export { createSmithersSolidRoot } from './root.js'

// Re-export SolidJS primitives using browser build for reactivity
// Users should import these from @evmts/smithers instead of solid-js directly
// to ensure signals work properly in Node.js environments
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
} from './solid-shim.js'

// Control flow components - custom implementations for Smithers tree rendering
// These replace solid-js Show/For/Switch/Match/Index which are designed for DOM
export { Show, For, Switch, Match, Index } from './control-flow.js'

// Components
export {
  Claude,
  ClaudeApi,
  ClaudeCli,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  Task,
  OutputFormat,
  Human,
  Stop,
  Output,
  File,
  Worktree,
  type ClaudeProps,
  type ClaudeApiProps,
  type ClaudeCliProps,
  type SubagentProps,
  type PhaseProps,
  type StepProps,
  type PersonaProps,
  type ConstraintsProps,
  type TaskProps,
  type OutputFormatProps,
  type HumanProps,
  type StopProps,
  type OutputProps,
  type FileProps,
  type WorktreeProps,
} from './components/index.js'

// Sequence helpers for multi-phase execution
export {
  createSequence,
  createChecklist,
  createStep,
} from './sequence.js'

// Re-export core execution from smithers-core
export {
  executePlan,
  executeNode,
  type ExecuteNodeResult,
  type ExecuteOptions,
  type ExecutionResult,
  type FrameResult,
} from '@evmts/smithers-core'

// Import SmithersNode type for serialize function
import type { SmithersNode } from './renderer.js'

/**
 * Serialize a SmithersNode tree to XML string
 *
 * This produces identical output to the React version's serialize() function.
 * The XML format is the "plan" that gets sent to Claude for execution.
 *
 * @param node - The root SmithersNode to serialize
 * @returns XML string representation of the tree
 *
 * @example
 * ```tsx
 * const root = createSmithersSolidRoot()
 * root.mount(() => <Claude>Hello world</Claude>)
 * const xml = serialize(root.getTree())
 * // Output: <claude>\n  Hello world\n</claude>
 * ```
 */
export function serialize(node: SmithersNode): string {
  if (node.type === 'TEXT') {
    return escapeXml(String(node.props.value ?? ''))
  }

  if (node.type === 'ROOT') {
    return node.children.map(serialize).join('\n')
  }

  // Props that should not be serialized to XML (runtime-only, not part of the plan)
  const NON_SERIALIZABLE_PROPS = new Set([
    'children',
    'value',
    'schema',          // Zod schema object
    'tools',           // Tool array with execute functions
    'onFinished',      // Callback
    'onError',         // Callback
    'onToolError',     // Callback
    'onStreamStart',   // Callback
    'onStreamDelta',   // Callback
    'onStreamEnd',     // Callback
    'onApprove',       // Callback
    'onReject',        // Callback
    'onWritten',       // Callback
    'onCreated',       // Callback
    'onCleanup',       // Callback
    'mcpServers',      // MCP server configs
    'toolRetry',       // Retry configuration
    'debug',           // Debug options
  ])

  const attrs = Object.entries(node.props)
    .filter(([key]) => !NON_SERIALIZABLE_PROPS.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'function') {
        return `${key}="${escapeXml(String(value))}"`
      }
      if (typeof value === 'object') {
        return `${key}="${escapeXml(JSON.stringify(value))}"`
      }
      return `${key}="${escapeXml(String(value))}"`
    })
    .join(' ')

  const children = node.children.map(serialize).join('\n')
  const tag = node.type.toLowerCase()

  if (children) {
    return `<${tag}${attrs ? ' ' + attrs : ''}>\n${indent(children)}\n</${tag}>`
  }

  return `<${tag}${attrs ? ' ' + attrs : ''} />`
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Indent each line of a string
 */
function indent(str: string, spaces = 2): string {
  const prefix = ' '.repeat(spaces)
  return str
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
}

/**
 * Render a Solid component to XML plan string
 *
 * Convenience function that creates a root, mounts the component,
 * serializes the tree, and disposes the root.
 *
 * @param App - A function returning JSX to render
 * @returns Promise resolving to the XML string
 *
 * @example
 * ```tsx
 * const xml = await renderPlan(() => (
 *   <Claude>
 *     <Phase name="research">
 *       <Step>Find sources</Step>
 *     </Phase>
 *     Analyze the topic
 *   </Claude>
 * ))
 * ```
 */
export async function renderPlan(App: () => any): Promise<string> {
  const root = createSmithersSolidRoot()
  root.mount(App)
  await root.flush()
  const xml = serialize(root.getTree())
  root.dispose()
  return xml
}

// Re-export createSmithersSolidRoot for convenience
import { createSmithersSolidRoot } from './root.js'
