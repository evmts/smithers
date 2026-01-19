import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'

/**
 * Smithers middleware for enhancing Claude component behavior.
 *
 * IMPORTANT: Operates at the CLI execution level, not the API level.
 * Middleware cannot intercept individual API calls or modify streaming
 * response chunks from the Claude API. Instead, it can:
 * - Modify CLI options before execution
 * - Wrap the entire CLI execution
 * - Process stdout/stderr chunks
 * - Transform final results
 */
export interface SmithersMiddleware {
  /**
   * Middleware name for debugging/logging
   */
  name?: string

  /**
   * Transform CLI execution options before spawning subprocess.
   * Use this to modify system prompt, timeout, tools, etc.
   */
  transformOptions?: (
    options: CLIExecutionOptions
  ) => CLIExecutionOptions | Promise<CLIExecutionOptions>

  /**
   * Wrap the entire CLI execution.
   * Use this for retry logic, caching, rate limiting, cost tracking.
   */
  wrapExecute?: (
    doExecute: () => Promise<AgentResult>,
    options: CLIExecutionOptions
  ) => Promise<AgentResult>

  /**
   * Transform stdout/stderr chunks as they arrive.
   * Use this for filtering, redacting, or parsing streaming output.
   *
   * NOTE: This is called for EVERY chunk, potentially hundreds of times.
   * Keep this function fast and side-effect free.
   */
  transformChunk?: (chunk: string) => string

  /**
   * Transform the final result after CLI execution completes.
   * Use this for extracting data, validating output, adding metadata.
   */
  transformResult?: (
    result: AgentResult
  ) => AgentResult | Promise<AgentResult>
}
