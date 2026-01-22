import type { UseVcsOperationOptions, VcsOperationContext } from '../VCS/useVcsOperation.js'
import { useVcsOperation } from '../VCS/useVcsOperation.js'

export type UseJJOperationOptions<TState> = UseVcsOperationOptions<TState>
export type JJOperationContext<TState> = VcsOperationContext<TState>

export function useJJOperation<TState extends { status: string }>(
  options: UseJJOperationOptions<TState>
) {
  return useVcsOperation(options)
}
