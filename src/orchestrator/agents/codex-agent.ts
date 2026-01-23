/**
 * Codex agent executor for the orchestrator system
 * Codex typically refers to Claude agents running under codex.smith.ai or similar services
 */

import type {
  AgentExecutor,
  AgentInvocation,
  AgentToolResult,
  AgentExecutionContext,
  AgentToolConfig
} from './types.js'

/**
 * Request/response types for Codex API
 */
interface CodexRequest {
  prompt: string
  model: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  tools?: string[]
  context?: Record<string, any>
}

interface CodexResponse {
  success: boolean
  content?: string
  error?: string
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
  execution_time?: number
  turns?: number
  stop_reason?: string
  raw?: any
}

/**
 * Codex agent executor implementation
 */
export class CodexAgentExecutor implements AgentExecutor {
  getDefaultConfig(): Partial<AgentToolConfig> {
    return {
      model: 'claude-3.5-sonnet',
      maxTokens: 4000,
      temperature: 0.1, // Lower temperature for more deterministic code generation
      timeout: 60000    // Longer timeout for complex operations
    }
  }

  validateConfig(config: AgentToolConfig): void {
    if (!config.model || config.model.trim() === '') {
      throw new Error('Model is required for Codex agent')
    }

    if (config.maxTokens !== undefined && config.maxTokens <= 0) {
      throw new Error('maxTokens must be positive')
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 1)) {
      throw new Error('temperature must be between 0 and 1')
    }

    if (config.timeout !== undefined && config.timeout <= 0) {
      throw new Error('timeout must be positive')
    }
  }

  async execute(
    invocation: AgentInvocation,
    context: AgentExecutionContext
  ): Promise<AgentToolResult> {
    const startTime = Date.now()

    try {
      // Validate required environment variables
      const apiKey = context.env['CODEX_API_KEY']
      const apiUrl = context.env['CODEX_API_URL']

      if (!apiKey) {
        return {
          success: false,
          error: 'CODEX_API_KEY environment variable is required',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        }
      }

      if (!apiUrl) {
        return {
          success: false,
          error: 'CODEX_API_URL environment variable is required',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        }
      }

      // Build the request payload
      const requestPayload = this.buildRequestPayload(invocation)

      context.log(`Making request to Codex API: ${apiUrl}`)

      // Make the API request with timeout
      const timeoutMs = invocation.config.timeout || 60000
      const response = await this.makeRequest(apiUrl, requestPayload, apiKey, timeoutMs, context)

      // Parse the response
      const result = await this.parseResponse(response)

      const executionTime = Date.now() - startTime
      result.executionTime = executionTime

      context.log(`Codex execution completed in ${executionTime}ms - Success: ${result.success}`)

      return result

    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      context.log(`Codex execution failed after ${executionTime}ms: ${errorMessage}`)

      return {
        success: false,
        error: errorMessage,
        executionTime,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      }
    }
  }

  /**
   * Build the request payload for the Codex API
   */
  private buildRequestPayload(invocation: AgentInvocation): CodexRequest {
    const { prompt, config, context: invocationContext } = invocation

    const payload: CodexRequest = {
      prompt,
      model: config.model
    }

    if (config.maxTokens !== undefined) {
      payload.maxTokens = config.maxTokens
    }

    if (config.temperature !== undefined) {
      payload.temperature = config.temperature
    }

    if (config.systemPrompt) {
      payload.systemPrompt = config.systemPrompt
    }

    if (config.tools && config.tools.length > 0) {
      payload.tools = config.tools.map(tool => {
        if (typeof tool === 'string') {
          return tool
        } else if (tool.name) {
          return tool.name
        }
        throw new Error(`Invalid tool format for Codex: ${JSON.stringify(tool)}`)
      })
    }

    if (invocationContext) {
      payload.context = invocationContext
    }

    return payload
  }

  /**
   * Make HTTP request to Codex API with timeout handling
   */
  private async makeRequest(
    apiUrl: string,
    payload: CodexRequest,
    apiKey: string,
    timeoutMs: number,
    context: AgentExecutionContext
  ): Promise<Response> {
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, timeoutMs)

    // Listen to external abort signal if provided
    if (context.abortSignal) {
      context.abortSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId)
        abortController.abort()
      })
    }

    try {
      const response = await fetch(`${apiUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'Smithers-Orchestrator/1.0'
        },
        body: JSON.stringify(payload),
        signal: abortController.signal
      })

      clearTimeout(timeoutId)
      return response

    } catch (error) {
      clearTimeout(timeoutId)

      if (abortController.signal.aborted) {
        throw new Error('Request timeout exceeded')
      }

      throw error
    }
  }

  /**
   * Parse the response from Codex API
   */
  private async parseResponse(response: Response): Promise<AgentToolResult> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}. ${errorText}`,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      }
    }

    try {
      const data: CodexResponse = await response.json()

      // Handle Codex error response format
      if (!data.success) {
        return {
          success: false,
          error: data.error || 'Unknown Codex API error',
          usage: data.usage ? {
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
            totalTokens: data.usage.total_tokens
          } : { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        }
      }

      // Success response
      return {
        success: true,
        content: data.content,
        usage: data.usage ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined,
        turns: data.turns || 1,
        stopReason: this.mapStopReason(data.stop_reason),
        raw: data.raw
      }

    } catch (error) {
      return {
        success: false,
        error: `Failed to parse Codex response: ${error instanceof Error ? error.message : String(error)}`,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      }
    }
  }

  /**
   * Map Codex stop reasons to standard format
   */
  private mapStopReason(stopReason?: string): 'completed' | 'max_turns' | 'timeout' | 'error' | undefined {
    if (!stopReason) return undefined

    switch (stopReason.toLowerCase()) {
      case 'completed':
      case 'end_turn':
      case 'stop':
        return 'completed'
      case 'max_turns':
      case 'turn_limit':
        return 'max_turns'
      case 'timeout':
      case 'time_limit':
        return 'timeout'
      case 'error':
      case 'failed':
        return 'error'
      default:
        return 'completed'
    }
  }
}