/**
 * Mount lifecycle hooks vendored from react-use
 * https://github.com/streamich/react-use
 * License: MIT
 */

import type { ReactNode } from "react";
import {
  DependencyList,
  EffectCallback,
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";

export interface ExecutionGateProviderProps {
  enabled: boolean;
  children: ReactNode;
}

const ExecutionGateContext = createContext<boolean>(true);

export function ExecutionGateProvider(props: ExecutionGateProviderProps): ReactNode {
  return createElement(ExecutionGateContext.Provider, { value: props.enabled }, props.children);
}

export function useExecutionGate(): boolean {
  return useContext(ExecutionGateContext);
}

/**
 * Runs an effect exactly once when the component mounts.
 * Unlike a raw useEffect with [], this is semantically clear about intent.
 */
export const useEffectOnce = (effect: EffectCallback) => {
  useEffect(effect, []);
};

/**
 * Runs a callback when the component mounts.
 * More robust than useEffect(() => fn(), []) because it:
 * - Clearly communicates mount-only intent
 * - Is easier to grep for mount behavior
 */
export const useMount = (fn: () => void) => {
  const enabled = useExecutionGate();
  const fnRef = useRef(fn);
  const hasRunRef = useRef(false);

  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;
    fnRef.current();
  }, [enabled]);
};

/**
 * Runs a callback when the component unmounts.
 * More robust than useEffect cleanup because it:
 * - Always calls the latest version of the callback (via ref)
 * - Avoids stale closure issues that plague normal cleanup functions
 */
export const useUnmount = (fn: () => void): void => {
  const fnRef = useRef(fn);
  const enabled = useExecutionGate();
  const hasEnabledRef = useRef(enabled);

  // Update the ref each render so if it changes, the newest callback will be invoked
  fnRef.current = fn;
  if (enabled) {
    hasEnabledRef.current = true;
  }

  useEffectOnce(() => () => {
    if (hasEnabledRef.current) {
      fnRef.current();
    }
  });
};

/**
 * Returns true only on the first render, false on all subsequent renders.
 * Useful for skipping effects on mount or detecting initial state.
 */
export function useFirstMountState(): boolean {
  const isFirst = useRef(true);

  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }

  return false;
}

/**
 * Returns a function that tells you if the component is currently mounted.
 * Essential for avoiding "setState on unmounted component" warnings in async code.
 *
 * @example
 * const isMounted = useMountedState();
 *
 * useEffect(() => {
 *   fetchData().then(data => {
 *     if (isMounted()) {
 *       setData(data);
 *     }
 *   });
 * }, []);
 */
export function useMountedState(): () => boolean {
  const mountedRef = useRef<boolean>(false);
  const get = useCallback(() => mountedRef.current, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return get;
}

/**
 * Returns the value from the previous render.
 * Returns undefined on the first render.
 *
 * @example
 * const count = useCount();
 * const prevCount = usePrevious(count);
 * // On first render: prevCount is undefined
 * // After count changes: prevCount is the old value
 */
export function usePrevious<T>(state: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = state;
  }, [state]);

  return ref.current;
}

const UNSET = Symbol("unset");

/**
 * Runs an effect when a value changes, with idempotency guarantees.
 * Unlike useEffect with [value], this:
 * - Won't run twice for the same value (handles React strict mode)
 * - Updates the "last seen" value synchronously before running the effect
 * - Runs on first mount (when value first becomes available)
 *
 * @example
 * const ralphCount = ralph?.ralphCount ?? 0;
 *
 * useEffectOnValueChange(ralphCount, () => {
 *   // Runs once when ralphCount changes, idempotent
 *   executeTask();
 * });
 */
export function useEffectOnValueChange<T>(
  value: T,
  effect: () => void | (() => void),
  deps: DependencyList = []
): void {
  const lastValueRef = useRef<T | typeof UNSET>(UNSET);
  const effectRef = useRef(effect);
  const enabled = useExecutionGate();
  effectRef.current = effect;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (lastValueRef.current !== UNSET && Object.is(lastValueRef.current, value)) {
      return;
    }
    lastValueRef.current = value;
    return effectRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, value, ...deps]);
}

/**
 * Runs a callback once when execution is enabled.
 * Encapsulates the common pattern of:
 * - executionEnabled check from SmithersProvider context
 * - hasStartedRef idempotency guard
 * - Proper dependency handling
 * 
 * @param executionEnabled - Whether execution is enabled (from useSmithers())
 * @param fn - Callback to run once when execution becomes enabled
 * @param deps - Additional dependencies (optional)
 * 
 * @example
 * const { executionEnabled } = useSmithers()
 * 
 * useExecutionMount(executionEnabled, () => {
 *   // Runs once when executionEnabled becomes true
 *   executeTask();
 * }, [someDep]);
 */
export function useExecutionMount(
  executionEnabled: boolean,
  fn: () => void,
  deps: DependencyList = []
): void {
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (!executionEnabled || hasStartedRef.current) return;
    hasStartedRef.current = true;
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionEnabled, ...deps]);
}
