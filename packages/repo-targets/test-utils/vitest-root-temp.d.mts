/** Register ownership-checked root transform cleanup on the pinned Vitest lifecycle. */
export declare function registerRootCleanup(runner: {
  onClose(callback: () => Promise<void>): unknown
}): void
