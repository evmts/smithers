import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'

export type ClaudeExecutionParams = CLIExecutionOptions

/**
 * Smithers middleware for enhancing Claude execution.
 * Operates at the CLI execution level.
 */
export interface SmithersMiddleware {
  /**
   * Optional name for debugging/logging.
   */
  name?: string

  /**
   * Transform CLI execution options before running.
   */
  transformOptions?: (
    options: CLIExecutionOptions
  ) => CLIExecutionOptions | Promise<CLIExecutionOptions>

  /**
   * Wrap the execution operation.
   */
  wrapExecute?: (options: {
    doExecute: () => Promise<AgentResult>
    options: CLIExecutionOptions
  }) => Promise<AgentResult>

  /**
   * Transform streaming chunks passed to onProgress.
   */
  transformChunk?: (chunk: string) => string

  /**
   * Transform the final result before callbacks.
   */
  transformResult?: (result: AgentResult) => AgentResult | Promise<AgentResult>
}
