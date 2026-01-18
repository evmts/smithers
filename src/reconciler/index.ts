/**
 * Smithers Reconciler - Custom React renderer for AI orchestration
 *
 * This module exports everything needed to render React components
 * to SmithersNode trees.
 */

// Root creation and mounting
export { createSmithersRoot, getCurrentTreeXML } from "./root.js";
export type { SmithersRoot } from "./root.js";

// Low-level renderer methods (for testing without JSX)
export { rendererMethods } from "./methods.js";

// React reconciler instance and host config
export { SmithersReconciler, rendererMethods as hostConfigMethods } from "./host-config.js";

// Serialization
export { serialize } from "./serialize.js";

// Types
export type {
  SmithersNode,
  ExecutionState,
  ExecuteOptions,
  ExecutionResult,
  DebugOptions,
  DebugEvent,
} from "./types.js";

// Re-export React hooks for convenience
export {
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  useRef,
  useReducer,
  createContext,
} from "react";

// Custom hooks
export {
  useEffectOnce,
  useMount,
  useUnmount,
  useFirstMountState,
  useMountedState,
} from "./hooks.js";
