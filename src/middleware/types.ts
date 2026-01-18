import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'

export type ClaudeExecutionParams = CLIExecutionOptions

/**
 * Smithers middleware for enhancing Claude execution.
 * Inspired by Vercel AI SDK's LanguageModelMiddleware.
 */
export interface SmithersMiddleware {
  /**
   * Optional name for debugging/logging.
   */
  name?: string

  /**
   * Transform execution parameters before running.
   */
  transformParams?: (options: {
    type: 'execute'
    params: ClaudeExecutionParams
  }) => ClaudeExecutionParams | Promise<ClaudeExecutionParams>

  /**
   * Wrap the execution operation.
   */
  wrapExecute?: (options: {
    doExecute: () => Promise<AgentResult>
    params: ClaudeExecutionParams
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
