import { z } from 'zod'
import type { SmithersTool, SmithersToolContext } from '../../tools/types.js'
import { AgentInvocationRequestSchema, AgentResponseSchema } from './types.js'
import type { Agent, AgentType, AgentInvocationRequest, AgentResponse } from './types.js'

// ============================================================================
// Agent Tool Input Schema (excluding agentType for single-agent tools)
// ============================================================================

const AgentToolInputSchema = z.object({
  prompt: z.string().describe('The prompt/instruction to send to the agent'),
  model: z.string().optional().describe('Model variant to use (e.g., "sonnet", "opus", "haiku")'),
  maxTokens: z.number().optional().describe('Maximum tokens for the response'),
  temperature: z.number().optional().describe('Temperature for response generation (0-1)'),
  tools: z.array(z.string()).optional().describe('Tools available to the agent'),
  timeout: z.number().optional().describe('Timeout in milliseconds'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata for the invocation')
})

export type AgentToolInput = z.infer<typeof AgentToolInputSchema>

// ============================================================================
// Create Agent-Specific Tool
// ============================================================================

/**
 * Creates a SmithersTool for invoking a specific agent type
 *
 * @param agent The agent instance to wrap as a tool
 * @returns A SmithersTool that can invoke the agent
 */
export function createAgentTool(agent: Agent): SmithersTool<typeof AgentToolInputSchema, AgentResponse> {
  return {
    name: `invoke_${agent.type}_agent`,
    description: `Invoke the ${agent.type} agent to process prompts and execute tasks. This agent can handle complex instructions and has access to various tools.`,
    inputSchema: AgentToolInputSchema,
    outputSchema: AgentResponseSchema,
    requiresSmithersContext: true,

    async execute(input: AgentToolInput, options): Promise<AgentResponse> {
      const context = options?.smithers || options?.experimental_context
      if (!context) {
        throw new Error('Smithers context is required for agent tool execution')
      }

      try {
        context.log(`Invoking ${agent.type} agent with prompt: ${input.prompt.slice(0, 100)}...`)

        const invocationRequest: AgentInvocationRequest = {
          agentType: agent.type,
          ...input
        }

        const startTime = Date.now()
        const response = await agent.invoke(invocationRequest)
        const executionTime = Date.now() - startTime

        context.log(`Agent invocation completed in ${executionTime}ms`)

        return {
          ...response,
          executionTime: response.executionTime ?? executionTime
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        context.log(`Agent invocation failed: ${errorMessage}`)

        return {
          success: false,
          error: errorMessage,
          agentType: agent.type,
          executionTime: 0
        }
      }
    }
  }
}

// ============================================================================
// Create Generic Agent Invocation Tool
// ============================================================================

/**
 * Creates a generic SmithersTool for invoking any agent type
 *
 * @param getAgent Function to retrieve an agent by type
 * @returns A SmithersTool that can invoke any available agent
 */
export function createInvokeAgentTool(
  getAgent: (type: AgentType) => Agent
): SmithersTool<typeof AgentInvocationRequestSchema, AgentResponse> {
  return {
    name: 'invoke_agent',
    description: 'Invoke any available agent (Claude, Gemini, or Codex) to process prompts and execute tasks. Specify the agent type in the request.',
    inputSchema: AgentInvocationRequestSchema,
    outputSchema: AgentResponseSchema,
    requiresSmithersContext: true,

    async execute(input: AgentInvocationRequest, options): Promise<AgentResponse> {
      const context = options?.smithers || options?.experimental_context
      if (!context) {
        throw new Error('Smithers context is required for agent tool execution')
      }

      try {
        context.log(`Retrieving ${input.agentType} agent for invocation`)
        const agent = getAgent(input.agentType)

        context.log(`Invoking ${input.agentType} agent with prompt: ${input.prompt.slice(0, 100)}...`)

        const startTime = Date.now()
        const response = await agent.invoke(input)
        const executionTime = Date.now() - startTime

        context.log(`Agent invocation completed in ${executionTime}ms`)

        return {
          ...response,
          executionTime: response.executionTime ?? executionTime
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        context.log(`Agent invocation failed: ${errorMessage}`)

        return {
          success: false,
          error: errorMessage,
          agentType: input.agentType,
          executionTime: 0
        }
      }
    }
  }
}

// ============================================================================
// Tool Registration Helper
// ============================================================================

/**
 * Creates all agent tools for a given registry
 *
 * @param getAgent Function to retrieve agents
 * @param supportedTypes Array of supported agent types
 * @returns Array of SmithersTools for agent invocation
 */
export function createAllAgentTools(
  getAgent: (type: AgentType) => Agent,
  supportedTypes: AgentType[]
): SmithersTool[] {
  const tools: SmithersTool[] = []

  // Add individual agent tools
  for (const agentType of supportedTypes) {
    try {
      const agent = getAgent(agentType)
      tools.push(createAgentTool(agent))
    } catch (error) {
      console.warn(`Failed to create tool for agent type ${agentType}:`, error)
    }
  }

  // Add generic agent invocation tool
  tools.push(createInvokeAgentTool(getAgent))

  return tools
}