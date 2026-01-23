/**
 * Gemini agent executor for the orchestrator system
 */

import type {
  AgentExecutor,
  AgentInvocation,
  AgentToolResult,
  AgentExecutionContext,
  AgentToolConfig
} from './types.js'

/**
 * Mock Google AI SDK types for development
 * In production, these would be imported from @google/generative-ai
 */
interface GoogleAISDK {
  GoogleGenerativeAI: new (apiKey: string) => GenerativeAI
}

interface GenerativeAI {
  getGenerativeModel(params: { model: string }): GenerativeModel
}

interface GenerativeModel {
  generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>
}

interface GenerateContentRequest {
  contents: Content[]
  generationConfig?: GenerationConfig
  tools?: any[]
}

interface Content {
  role: string
  parts: Part[]
}

interface Part {
  text: string
}

interface GenerationConfig {
  temperature?: number
  maxOutputTokens?: number
  topP?: number
  topK?: number
}

interface GenerateContentResponse {
  response: {
    text(): string
    candidates: Candidate[]
    usageMetadata?: UsageMetadata
  }
}

interface Candidate {
  content?: { parts: Part[] } | null
  finishReason: string
}

interface UsageMetadata {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
}

/**
 * Gemini agent executor implementation
 */
export class GeminiAgentExecutor implements AgentExecutor {
  getDefaultConfig(): Partial<AgentToolConfig> {
    return {
      model: 'gemini-1.5-flash',
      maxTokens: 8192,
      temperature: 0.7,
      timeout: 30000
    }
  }

  validateConfig(config: AgentToolConfig): void {
    if (!config.model || config.model.trim() === '') {
      throw new Error('Model is required for Gemini agent')
    }

    if (config.maxTokens !== undefined && config.maxTokens <= 0) {
      throw new Error('maxTokens must be positive')
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      throw new Error('temperature must be between 0 and 2')
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
      if (!context.env['GOOGLE_API_KEY']) {
        return {
          success: false,
          error: 'GOOGLE_API_KEY environment variable is required',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        }
      }

      // Create Gemini model
      const model = this.createModel(context, invocation.config)

      // Build the request
      const request = this.buildRequest(invocation)

      context.log(`Making request to Gemini model: ${invocation.config.model}`)

      // Execute with timeout if specified
      const timeoutMs = invocation.config.timeout || 30000
      let response: GenerateContentResponse

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
          const responsePromise = model.generateContent(request)
          response = await Promise.race([
            responsePromise,
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
        response = await model.generateContent(request)
      }

      // Parse the response
      const result = this.parseResponse(response)

      const executionTime = Date.now() - startTime
      result.executionTime = executionTime

      context.log(`Gemini execution completed in ${executionTime}ms - Success: ${result.success}`)

      return result

    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      context.log(`Gemini execution failed after ${executionTime}ms: ${errorMessage}`)

      return {
        success: false,
        error: errorMessage,
        executionTime,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      }
    }
  }

  /**
   * Create Gemini model instance
   * In production, this would use the real Google AI SDK
   */
  private createModel(context: AgentExecutionContext, config: AgentToolConfig): GenerativeModel {
    try {
      // Try to import the Google AI SDK (optional dependency)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GoogleGenerativeAI } = require('@google/generative-ai') as GoogleAISDK

      const genAI = new GoogleGenerativeAI(context.env['GOOGLE_API_KEY']!)
      return genAI.getGenerativeModel({ model: config.model })
    } catch (error) {
      // Fallback to mock for testing or when SDK not available
      return this.createMockModel()
    }
  }

  /**
   * Create a mock model for testing
   */
  private createMockModel(): GenerativeModel {
    return {
      generateContent: async () => {
        throw new Error('Google AI SDK not available. Install @google/generative-ai package.')
      }
    }
  }

  /**
   * Build request for the Gemini API
   */
  private buildRequest(invocation: AgentInvocation): GenerateContentRequest {
    const { prompt, config } = invocation

    let contents: Content[]

    if (config.systemPrompt) {
      // Include system prompt as initial message
      contents = [
        {
          role: 'user',
          parts: [{ text: `${config.systemPrompt}\n\n${prompt}` }]
        }
      ]
    } else {
      contents = [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    }

    const request: GenerateContentRequest = {
      contents
    }

    // Add generation config if specified
    const generationConfig: GenerationConfig = {}

    if (config.temperature !== undefined) {
      generationConfig.temperature = config.temperature
    }

    if (config.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = config.maxTokens
    }

    // Add other provider-specific options
    if (config.providerOptions?.topP !== undefined) {
      generationConfig.topP = config.providerOptions.topP
    }

    if (config.providerOptions?.topK !== undefined) {
      generationConfig.topK = config.providerOptions.topK
    }

    if (Object.keys(generationConfig).length > 0) {
      request.generationConfig = generationConfig
    }

    // Add tools if provided (simplified for now)
    if (config.tools && config.tools.length > 0) {
      request.tools = config.tools.map(tool => {
        if (typeof tool === 'string') {
          return { name: tool }
        }
        return tool
      })
    }

    return request
  }

  /**
   * Parse response from Gemini API
   */
  private parseResponse(response: GenerateContentResponse): AgentToolResult {
    const candidate = response.response.candidates[0]

    // Check for safety blocking
    if (candidate.finishReason === 'SAFETY') {
      return {
        success: false,
        error: 'Response blocked due to safety concerns',
        usage: this.extractUsage(response.response.usageMetadata)
      }
    }

    // Check for other error conditions
    if (candidate.finishReason === 'RECITATION') {
      return {
        success: false,
        error: 'Response blocked due to recitation concerns',
        usage: this.extractUsage(response.response.usageMetadata)
      }
    }

    // Extract content
    const content = response.response.text()

    // Map finish reason to stop reason
    const stopReason = this.mapFinishReason(candidate.finishReason)

    return {
      success: true,
      content,
      usage: this.extractUsage(response.response.usageMetadata),
      turns: 1, // Gemini doesn't have multi-turn in a single call
      stopReason,
      raw: response
    }
  }

  /**
   * Extract usage statistics from response
   */
  private extractUsage(usageMetadata?: UsageMetadata) {
    if (!usageMetadata) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    }

    return {
      inputTokens: usageMetadata.promptTokenCount || 0,
      outputTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0
    }
  }

  /**
   * Map Gemini finish reasons to standard format
   */
  private mapFinishReason(finishReason: string): 'completed' | 'max_turns' | 'timeout' | 'error' | undefined {
    switch (finishReason) {
      case 'STOP':
        return 'completed'
      case 'MAX_TOKENS':
        return 'max_turns' // Close enough
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER':
        return 'error'
      default:
        return 'completed'
    }
  }
}