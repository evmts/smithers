/**
 * Simple sleep utility that returns a Promise that resolves after specified milliseconds.
 * Used for throttling Ralph loop iterations.
 *
 * @param ms - Milliseconds to sleep. Values < 0 are clamped to 0.
 * @returns Promise that resolves after the timeout
 */
export function sleep(ms: number): Promise<void> {
  // Clamp negative values to 0
  const delay = Math.max(0, ms);

  return new Promise<void>((resolve) => {
    setTimeout(resolve, delay);
  });
}