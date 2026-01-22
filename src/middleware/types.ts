import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'

export type ClaudeExecutionParams = CLIExecutionOptions

export interface SmithersMiddleware {
  name?: string
  transformOptions?: (options: CLIExecutionOptions) => CLIExecutionOptions | Promise<CLIExecutionOptions>
  wrapExecute?: (options: { doExecute: () => Promise<AgentResult>; options: CLIExecutionOptions }) => Promise<AgentResult>
  transformChunk?: (chunk: string) => string
  transformResult?: (result: AgentResult) => AgentResult | Promise<AgentResult>
}
