/**
 * Test Utilities for Smithers
 *
 * Provides helper functions for testing Smithers components and the renderer.
 */

import type { JSX } from 'solid-js'
import type { SmithersNode, ExecutionResult } from '../src/core/types'
import { serialize } from '../src/core/serialize'
import { executePlan } from '../src/core/execute'
import { createSmithersRoot } from '../src/solid/root'

/**
 * Render a component to XML string without executing.
 * This is useful for testing component structure.
 */
export async function renderPlan(element: JSX.Element | (() => JSX.Element)): Promise<string> {
  const root = createSmithersRoot()

  // Handle both direct elements and component functions
  const App = typeof element === 'function' ? element : () => element

  // Mount with a short timeout to let the tree render
  const mountPromise = root.mount(App)

  // Use a race with a timeout to avoid hanging
  await Promise.race([
    mountPromise,
    new Promise<void>(resolve => setTimeout(resolve, 100)),
  ])

  const xml = root.toXML()
  root.dispose()
  return xml
}

/**
 * Run a component through the full execution pipeline.
 * This mounts, renders, and executes the component tree.
 */
export async function runPlan(element: JSX.Element | (() => JSX.Element)): Promise<ExecutionResult> {
  const root = createSmithersRoot()

  const App = typeof element === 'function' ? element : () => element

  // Mount with a timeout
  const mountPromise = root.mount(App)

  await Promise.race([
    mountPromise,
    new Promise<void>(resolve => setTimeout(resolve, 2000)),
  ])

  const tree = root.getTree()
  const result = await executePlan(tree, { maxFrames: 10, timeout: 5000 })

  root.dispose()
  return result
}

/**
 * Create a SmithersNode directly (without JSX).
 * Useful for testing serialization without JSX transformation issues.
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

  for (const child of children) {
    child.parent = node
    node.children.push(child)
  }

  return node
}

/**
 * Create a TEXT node directly.
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
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 10 } = options
  const start = Date.now()

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return
    }
    await delay(interval)
  }

  throw new Error(`waitFor timeout after ${timeout}ms`)
}

/**
 * Simple delay utility.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Create a mock component for testing.
 */
export function createMockComponent(type: string, props: Record<string, unknown> = {}) {
  return createNode(type, props)
}
