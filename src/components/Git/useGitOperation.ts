import type { UseVcsOperationOptions, VcsOperationContext } from '../VCS/useVcsOperation.js'
import { useVcsOperation } from '../VCS/useVcsOperation.js'

export type UseGitOperationOptions<TState> = UseVcsOperationOptions<TState>
export type GitOperationContext<TState> = VcsOperationContext<TState>

export function useGitOperation<TState extends { status: string }>(
  options: UseGitOperationOptions<TState>
) {
  return useVcsOperation(options)
}
