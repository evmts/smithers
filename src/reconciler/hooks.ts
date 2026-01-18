/**
 * Mount lifecycle hooks vendored from react-use
 * https://github.com/streamich/react-use
 * License: MIT
 */

import {
  createContext,
  createElement,
  DependencyList,
  EffectCallback,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

const ExecutionGateContext = createContext(true);

export const ExecutionGateProvider = ({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) =>
  createElement(
    ExecutionGateContext.Provider,
    { value: enabled },
    children
  );

export const useExecutionGate = (): boolean => useContext(ExecutionGateContext);

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
  const fnRef = useRef(fn);
  const hasRunRef = useRef(false);
  const isEnabled = useExecutionGate();

  fnRef.current = fn;

  useEffect(() => {
    if (!isEnabled || hasRunRef.current) return;
    hasRunRef.current = true;
    fnRef.current();
  }, [isEnabled]);
};

/**
 * Runs a callback when the component unmounts.
 * More robust than useEffect cleanup because it:
 * - Always calls the latest version of the callback (via ref)
 * - Avoids stale closure issues that plague normal cleanup functions
 */
export const useUnmount = (fn: () => void): void => {
  const fnRef = useRef(fn);
  const wasEnabledRef = useRef(false);
  const isEnabled = useExecutionGate();

  // Update the ref each render so if it changes, the newest callback will be invoked
  fnRef.current = fn;

  useEffect(() => {
    if (isEnabled) {
      wasEnabledRef.current = true;
    }
  }, [isEnabled]);

  useEffectOnce(() => () => {
    if (!wasEnabledRef.current) return;
    fnRef.current();
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

  return isFirst.current;
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
  });

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
  const isEnabled = useExecutionGate();

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    if (lastValueRef.current !== UNSET && Object.is(lastValueRef.current, value)) {
      return;
    }
    lastValueRef.current = value;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isEnabled, ...deps]);
}
