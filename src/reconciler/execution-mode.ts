type ExecutionMode = 'execute' | 'plan'

let executionMode: ExecutionMode = 'execute'

export function setExecutionMode(mode: ExecutionMode): void {
  executionMode = mode
}

export function isExecutionEnabled(): boolean {
  return executionMode === 'execute'
}
