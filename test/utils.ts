/**
 * Test utilities for Smithers tests.
 *
 * Provides helpers for rendering and executing agent plans in tests.
 */

import type { JSX } from 'solid-js'
import { createRoot } from 'solid-js'
import { serialize } from '../src/core/serialize'
import { executePlan } from '../src/core/execute'
import type { SmithersNode, ExecuteOptions, ExecutionResult } from '../src/core/types'

/**
 * Render a JSX element to an XML plan string.
 *
 * This is the main utility for testing component rendering.
 * It creates a root, mounts the component, and returns the serialized XML.
 *
 * @example
 * ```tsx
 * const plan = await renderPlan(<Claude>Hello</Claude>)
 * expect(plan).toContain('<claude>')
 * ```
 */
export async function renderPlan(
  element: JSX.Element | (() => JSX.Element)
): Promise<string> {
  const { render } = await import('../src/solid/renderer.js')

  // Create root node
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  // Wrap in a function if not already
  const App = typeof element === 'function' ? element : () => element

  // Use Solid's createRoot for proper reactive context
  let dispose: (() => void) | undefined

  await new Promise<void>((resolve) => {
    createRoot((d) => {
      dispose = d
      // Render directly
      render(App as any, rootNode)
      // Give Solid a tick to finish rendering
      setTimeout(resolve, 50)
    })
  })

  const xml = serialize(rootNode)
  dispose?.()
  return xml
}

/**
 * Execute a JSX element and return the result.
 *
 * This is the main utility for testing component execution.
 *
 * @example
 * ```tsx
 * const result = await runPlan(<Claude>Hello</Claude>)
 * expect(result.output).toBeDefined()
 * ```
 */
export async function runPlan(
  element: JSX.Element | (() => JSX.Element),
  options: ExecuteOptions = {}
): Promise<ExecutionResult> {
  const { render } = await import('../src/solid/renderer.js')

  // Create root node
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  // Wrap in a function if not already
  const App = typeof element === 'function' ? element : () => element

  // Use Solid's createRoot for proper reactive context
  let dispose: (() => void) | undefined

  await new Promise<void>((resolve) => {
    createRoot((d) => {
      dispose = d
      render(App as any, rootNode)
      setTimeout(resolve, 100)
    })
  })

  // Execute the tree
  const result = await executePlan(rootNode, options)

  dispose?.()
  return result
}

/**
 * Create a SmithersNode manually for testing.
 *
 * Useful for testing serialization and execution without JSX.
 */
export function createNode(
  type: string,
  props: Record<string, unknown> = {},
  children: SmithersNode[] = []
): SmithersNode {
  const node: SmithersNode = {
    type,
    props,
    children: [],
    parent: null,
  }

  // Set up parent references
  for (const child of children) {
    child.parent = node
    node.children.push(child)
  }

  return node
}

/**
 * Create a text node for testing.
 */
export function createTextNode(value: string): SmithersNode {
  return {
    type: 'TEXT',
    props: { value },
    children: [],
    parent: null,
  }
}

/**
 * Wait for a condition to be true.
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 10
): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timeout')
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

/**
 * Wait for a specified number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Re-export common test dependencies for convenience
export { serialize }
export type { SmithersNode, ExecuteOptions, ExecutionResult }
