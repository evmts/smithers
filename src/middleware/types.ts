import type { AgentResult, CLIExecutionOptions } from '../components/agents/types/index.js'

export interface SmithersMiddleware {
  name: string
  wrapExecute?: (
    doExecute: () => Promise<AgentResult>,
    execOptions: CLIExecutionOptions
  ) => Promise<AgentResult>
}
