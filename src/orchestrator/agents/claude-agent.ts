/**
 * Claude agent executor for the orchestrator system
 */

import { Anthropic } from '@anthropic-ai/sdk'
import type {
  AgentExecutor,
  AgentInvocation,
  AgentToolResult,
  AgentExecutionContext,
  AgentToolConfig
} from './types.js'

/**
 * Claude agent executor implementation
 */
export class ClaudeAgentExecutor implements AgentExecutor {
  getDefaultConfig(): Partial<AgentToolConfig> {
    return {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4000,
      temperature: 0.7,
      timeout: 30000
    }
  }

  validateConfig(config: AgentToolConfig): void {
    if (!config.model || config.model.trim() === '') {
      throw new Error('Model is required for Claude agent')
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
      // Validate API key
      if (!context.env['ANTHROPIC_API_KEY']) {
        return {
          success: false,
          error: 'ANTHROPIC_API_KEY environment variable is required',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        }
      }

      // Create Anthropic client
      const client = this.createClient(context)

      // Build the request parameters
      const requestParams = this.buildRequestParams(invocation)

      context.log(`Making request to Claude model: ${invocation.config.model}`)

      // Execute with timeout if specified
      const timeoutMs = invocation.config.timeout || 30000
      const resultPromise = client.messages.create(requestParams)

      let response: Anthropic.Messages.Message

      if (context.abortSignal || timeoutMs) {
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
          response = await Promise.race([
            resultPromise as Promise<Anthropic.Messages.Message>,
            new Promise<never>((_, reject) => {
              abortController.signal.addEventListener('abort', () => {
                reject(new Error('Request timeout or aborted'))
              })
            })
          ])
          clearTimeout(timeoutId)
        } catch (error) {
          if (abortController.signal.aborted) {
            return {
              success: false,
              error: 'Request timeout exceeded',
              stopReason: 'timeout',
              executionTime: Date.now() - startTime,
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
            }
          }
          throw error
        }
      } else {
        response = await resultPromise as Anthropic.Messages.Message
      }

      // Extract content
      const content = this.extractContent(response)

      // Build usage statistics
      const usage = response.usage ? {
        inputTokens: response.usage.input_tokens || 0,
        outputTokens: response.usage.output_tokens || 0,
        totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
      } : {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }

      const executionTime = Date.now() - startTime

      context.log(`Claude execution completed successfully in ${executionTime}ms`)

      return {
        success: true,
        content,
        usage,
        executionTime,
        turns: 1, // Claude doesn't have multi-turn in a single call
        stopReason: response.stop_reason === 'end_turn' ? 'completed' : response.stop_reason as any,
        raw: response
      }

    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      context.log(`Claude execution failed after ${executionTime}ms: ${errorMessage}`)

      return {
        success: false,
        error: errorMessage,
        executionTime,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      }
    }
  }

  /**
   * Create Anthropic client instance
   */
  private createClient(context: AgentExecutionContext): Anthropic {
    return new Anthropic({
      apiKey: context.env['ANTHROPIC_API_KEY']!
    })
  }

  /**
   * Build request parameters for the Anthropic API
   */
  private buildRequestParams(
    invocation: AgentInvocation
  ): Anthropic.Messages.MessageCreateParams {
    const { prompt, config } = invocation

    const params: Anthropic.Messages.MessageCreateParams = {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: config.maxTokens || 4000
    }

    // Add system prompt if provided
    if (config.systemPrompt) {
      params.system = config.systemPrompt
    }

    // Add temperature if provided
    if (config.temperature !== undefined) {
      params.temperature = config.temperature
    }

    // Add tools if provided
    if (config.tools && config.tools.length > 0) {
      params.tools = this.buildToolDefinitions(config.tools)
    }

    return params
  }

  /**
   * Build tool definitions for the API
   */
  private buildToolDefinitions(tools: any[]): Anthropic.Messages.Tool[] {
    return tools.map(tool => {
      if (typeof tool === 'string') {
        // Built-in tool - create basic definition
        return {
          name: tool,
          description: `${tool} tool`,
          input_schema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      } else if (tool.name) {
        // Custom tool object
        return {
          name: tool.name,
          description: tool.description || `${tool.name} tool`,
          input_schema: tool.inputSchema || {
            type: 'object',
            properties: {},
            required: []
          }
        }
      } else {
        throw new Error(`Invalid tool definition: ${JSON.stringify(tool)}`)
      }
    })
  }

  /**
   * Extract text content from Claude response
   */
  private extractContent(response: Anthropic.Messages.Message): string {
    const textBlocks = response.content.filter(block => block.type === 'text')

    if (textBlocks.length === 0) {
      return ''
    }

    return textBlocks.map(block => (block as any).text).join('\n')
  }
}