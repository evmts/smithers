/**
 * Core agent tool creation and registry system
 * Enables invoking AI agents as tools within Smithers orchestration
 */

import { z } from 'zod'
import { createSmithersTool } from '../../tools/createSmithersTool.js'
import type { SmithersTool } from '../../tools/types.js'
import type {
  AgentProvider,
  AgentExecutor,
  AgentRegistry,
  AgentInvocation,
  AgentToolResult,
  AgentExecutionContext,
  CreateAgentToolOptions
} from './types.js'

/**
 * Default registry implementation for agent executors
 */
export class AgentToolRegistry implements AgentRegistry {
  private executors = new Map<AgentProvider, AgentExecutor>()

  register(provider: AgentProvider, executor: AgentExecutor): void {
    this.executors.set(provider, executor)
  }

  get(provider: AgentProvider): AgentExecutor | undefined {
    return this.executors.get(provider)
  }

  list(): AgentProvider[] {
    return Array.from(this.executors.keys())
  }
}

/**
 * Global registry instance - can be replaced if needed
 */
export const defaultAgentRegistry = new AgentToolRegistry()

/**
 * Schema for agent tool input validation
 */
const baseAgentInputSchema = z.object({
  prompt: z.string().describe('The prompt to send to the agent'),
  context: z.record(z.string(), z.any()).optional().describe('Optional context data'),
  configOverrides: z.record(z.string(), z.any()).optional().describe('Override config values for this execution')
})

// Type inference for the input schema
// type AgentToolInput = z.infer<typeof baseAgentInputSchema>

/**
 * Schema for agent tool output
 */
const agentOutputSchema = z.object({
  success: z.boolean(),
  content: z.string().optional(),
  error: z.string().optional(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number()
  }).optional(),
  executionTime: z.number().optional(),
  turns: z.number().optional(),
  stopReason: z.enum(['completed', 'max_turns', 'timeout', 'error']).optional(),
  raw: z.any().optional()
})

/**
 * Validates JSON schema against input data
 */
function validateJsonSchema(schema: any, data: any): void {
  if (!schema) return

  // Basic JSON schema validation
  if (schema.type === 'object' && schema.properties) {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Input must be an object')
    }

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in data)) {
          throw new Error(`Required field '${field}' is missing`)
        }
      }
    }

    // Basic type checking for properties
    for (const [prop, propSchema] of Object.entries(schema.properties)) {
      if (prop in data) {
        const value = data[prop]
        const expectedType = (propSchema as any).type

        if (expectedType === 'string' && typeof value !== 'string') {
          throw new Error(`Property '${prop}' must be a string`)
        }
        if (expectedType === 'number' && typeof value !== 'number') {
          throw new Error(`Property '${prop}' must be a number`)
        }
        if (expectedType === 'boolean' && typeof value !== 'boolean') {
          throw new Error(`Property '${prop}' must be a boolean`)
        }
        if (expectedType === 'array' && !Array.isArray(value)) {
          throw new Error(`Property '${prop}' must be an array`)
        }
      }
    }
  }
}

/**
 * Creates a Smithers tool from an agent configuration
 */
export function createAgentTool(
  options: CreateAgentToolOptions,
  registry: AgentRegistry = defaultAgentRegistry
): SmithersTool<typeof baseAgentInputSchema, AgentToolResult> {
  const { name, description, config, inputSchema, outputSchema, needsApproval = false } = options

  // Get the executor for this provider
  const executor = registry.get(config.provider)
  if (!executor) {
    throw new Error(`No executor found for provider: ${config.provider}`)
  }

  // Validate the configuration
  executor.validateConfig(config)

  return createSmithersTool({
    name,
    description,
    inputSchema: baseAgentInputSchema,
    outputSchema: agentOutputSchema,
    needsApproval,
    requiresSmithersContext: true,

    async execute(input, context) {
      const startTime = Date.now()

      // Validate custom input schema if provided
      if (inputSchema) {
        try {
          validateJsonSchema(inputSchema, input)
        } catch (error) {
          return {
            success: false,
            error: `Input validation failed: ${error instanceof Error ? error.message : String(error)}`,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
          }
        }
      }

      // Merge config with any overrides
      const mergedConfig = {
        ...config,
        ...(input.configOverrides || {})
      }

      // Create invocation
      const invocation: AgentInvocation = {
        prompt: input.prompt,
        config: mergedConfig,
        context: input.context || undefined
      }

      // Create execution context
      const executionContext: AgentExecutionContext = {
        cwd: context.cwd,
        env: context.env,
        agentId: context.agentId,
        executionId: context.executionId,
        abortSignal: context.abortSignal || undefined,
        log: context.log
      }

      try {
        context.log(`Starting ${config.provider} agent execution with prompt: ${input.prompt.slice(0, 100)}...`)

        const result = await executor.execute(invocation, executionContext)

        const executionTime = Date.now() - startTime
        result.executionTime = executionTime

        context.log(`Agent execution completed in ${executionTime}ms - Success: ${result.success}`)

        // Validate output schema if provided
        if (outputSchema && result.success) {
          try {
            validateJsonSchema(outputSchema, result)
          } catch (error) {
            context.log(`Output validation failed: ${error instanceof Error ? error.message : String(error)}`)
            // Don't fail the execution, just log the validation error
          }
        }

        return result
      } catch (error) {
        const executionTime = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)

        context.log(`Agent execution failed after ${executionTime}ms: ${errorMessage}`)

        return {
          success: false,
          error: errorMessage,
          executionTime,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        }
      }
    }
  })
}

/**
 * Helper to create multiple agent tools at once
 */
export function createAgentTools(
  configs: CreateAgentToolOptions[],
  registry: AgentRegistry = defaultAgentRegistry
): SmithersTool[] {
  return configs.map(config => createAgentTool(config, registry))
}

/**
 * Helper to register default agent executors
 */
export function registerDefaultAgents(registry: AgentRegistry = defaultAgentRegistry): void {
  // Dynamically import and register default implementations
  try {
    const { ClaudeAgentExecutor } = require('./claude-agent.js')
    registry.register('claude', new ClaudeAgentExecutor())
  } catch (error) {
    // Claude agent not available
  }

  try {
    const { CodexAgentExecutor } = require('./codex-agent.js')
    registry.register('codex', new CodexAgentExecutor())
  } catch (error) {
    // Codex agent not available
  }

  try {
    const { GeminiAgentExecutor } = require('./gemini-agent.js')
    registry.register('gemini', new GeminiAgentExecutor())
  } catch (error) {
    // Gemini agent not available
  }
}