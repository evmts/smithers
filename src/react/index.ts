/**
 * React renderer for Smithers
 */

export { createSmithersRoot } from './root.js'

// Export renderer methods for testing
export { rendererMethods } from './renderer-methods.js'

// Export the reconciler for advanced use cases
export { SmithersReconciler } from './renderer.js'

// Re-export React primitives for convenience
export {
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  useRef,
  useReducer,
  createContext,
} from 'react'

// Re-export types
export type { SmithersNode } from '../core/types.js'
