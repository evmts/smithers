import type { SmithersNode } from '../core/types.js'
import { rendererMethods } from './renderer-methods.js'

// Re-export rendererMethods for backwards compatibility
export { rendererMethods }

// Lazy-loaded solid-js renderer to avoid import errors in test environments
let _solidRenderer: ReturnType<typeof import('solid-js/universal').createRenderer<SmithersNode>> | null = null

async function getSolidRenderer() {
  if (!_solidRenderer) {
    const { createRenderer } = await import('solid-js/universal')
    _solidRenderer = createRenderer<SmithersNode>(rendererMethods)
  }
  return _solidRenderer
}

/**
 * Solid.js universal renderer for building SmithersNode trees.
 * Converts JSX → SmithersNode tree using Solid's fine-grained reactivity.
 */
export function createSmithersRenderer() {
  // Try synchronous import first (works in runtime environments)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const solidUniversal = require('solid-js/universal') as typeof import('solid-js/universal')
    return solidUniversal.createRenderer<SmithersNode>(rendererMethods)
  } catch {
    // In test environments, return a placeholder that will be populated later
    const notAvailable = () => { throw new Error('Solid renderer not available in this environment') }
    return {
      render: notAvailable,
      effect: notAvailable,
      memo: notAvailable,
      createComponent: notAvailable,
      createElement: notAvailable,
      createTextNode: notAvailable,
      insertNode: notAvailable,
      insert: notAvailable,
      spread: notAvailable,
      setProp: notAvailable,
      mergeProps: notAvailable,
      use: notAvailable,
    }
  }
}

// Export async helper for environments that need it
export { getSolidRenderer }

// Try to create the renderer synchronously for normal usage
const _renderer = createSmithersRenderer() as any

// Export all renderer functions that babel-preset-solid expects
export const render = _renderer.render
export const effect = _renderer.effect
export const memo = _renderer.memo
export const createComponent = _renderer.createComponent
export const createElement = _renderer.createElement
export const createTextNode = _renderer.createTextNode
export const insertNode = _renderer.insertNode
export const insert = _renderer.insert
export const spread = _renderer.spread
export const setProp = _renderer.setProp
export const mergeProps = _renderer.mergeProps
export const use = _renderer.use

export type { SmithersNode }
