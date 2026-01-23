import { useCallback } from "react";
import { sleep } from "../utils/sleep";

const DEFAULT_ITERATION_TIMEOUT = 10000; // 10 seconds

/**
 * Hook that provides a throttled sleep function for Ralph loop iterations.
 *
 * @param timeoutMs - Timeout in milliseconds between iterations. Defaults to 10000ms.
 * @returns Object with sleep function that respects the configured timeout
 */
export function useIterationTimeout(timeoutMs?: number) {
  const timeout = timeoutMs ?? DEFAULT_ITERATION_TIMEOUT;

  const sleepFn = useCallback(async (): Promise<void> => {
    return sleep(timeout);
  }, [timeout]);

  return {
    sleep: sleepFn
  };
}