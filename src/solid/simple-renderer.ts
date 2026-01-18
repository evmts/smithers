/**
 * Simple renderer for Smithers that doesn't use solid-js/universal.
 * This avoids the frozen node issues.
 */

import { createRoot, onMount, createSignal, createEffect, batch, untrack, on, onCleanup } from 'solid-js'
import type { SmithersNode } from '../core/types.js'
import { createOrchestrationPromise } from '../components/Ralph.jsx'

// Re-export Solid primitives
export { createSignal, createEffect, batch, untrack, on, onMount, onCleanup }

/**
 * Simple render function that just calls the component and collects the result.
 */
export function simpleRender(code: () => any, container: SmithersNode): () => void {
  let dispose: (() => void) | undefined

  // Use Solid's createRoot for reactivity
  createRoot((d) => {
    dispose = d

    // Call the component
    const result = code()

    // If the result is a SmithersNode, add it to the container
    if (result && typeof result === 'object' && 'type' in result && 'children' in result) {
      result.parent = container
      container.children.push(result)
    }
  })

  return () => dispose?.()
}

/**
 * Mount an app and wait for completion.
 */
export async function mountAndWait(
  App: () => any | Promise<any>,
  rootNode: SmithersNode
): Promise<() => void> {
  // Create completion promise
  const completionPromise = createOrchestrationPromise()

  // Handle async App
  let element: any
  const result = App()

  if (result && typeof result.then === 'function') {
    element = await result
  } else {
    element = result
  }

  // Render
  let dispose: (() => void) | undefined

  createRoot((d) => {
    dispose = d

    // Call the wrapper to execute any reactive logic
    const AppWrapper = () => element

    // Execute
    const rendered = AppWrapper()

    // Add to tree
    if (rendered && typeof rendered === 'object' && 'type' in rendered && 'children' in rendered) {
      rendered.parent = rootNode
      rootNode.children.push(rendered)
    }
  })

  // Wait for orchestration
  await completionPromise

  return () => dispose?.()
}

export type { SmithersNode }
