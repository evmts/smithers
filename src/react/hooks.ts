/**
 * Mount lifecycle hooks vendored from react-use
 * https://github.com/streamich/react-use
 * License: Unlicense (public domain)
 */

import { EffectCallback, useCallback, useEffect, useRef } from "react";

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
  useEffectOnce(() => {
    fn();
  });
};

/**
 * Runs a callback when the component unmounts.
 * More robust than useEffect cleanup because it:
 * - Always calls the latest version of the callback (via ref)
 * - Avoids stale closure issues that plague normal cleanup functions
 */
export const useUnmount = (fn: () => void): void => {
  const fnRef = useRef(fn);

  // Update the ref each render so if it changes, the newest callback will be invoked
  fnRef.current = fn;

  useEffectOnce(() => () => fnRef.current());
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
