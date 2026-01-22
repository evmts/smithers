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

export const useEffectOnce = (effect: EffectCallback) => {
  useEffect(effect, []);
};

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

export const useUnmount = (fn: () => void): void => {
  const fnRef = useRef(fn);
  const enabled = useExecutionGate();
  const hasEnabledRef = useRef(enabled);

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

export function useFirstMountState(): boolean {
  const isFirst = useRef(true);

  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }

  return false;
}

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

export function usePrevious<T>(state: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = state;
  }, [state]);

  return ref.current;
}

const UNSET = Symbol("unset");

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
