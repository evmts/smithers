import { z } from 'zod'

/**
 * Agent provider types supported for tool invocation
 */
export const AgentProvider = z.enum(['claude', 'gemini', 'codex'])
export type AgentProvider = z.infer<typeof AgentProvider>

/**
 * Tool definition schema (simplified to avoid z.record issues)
 */
export const ToolDefinition = z.object({
  name: z.string(),
  description: z.string(),
})
export type ToolDefinition = z.infer<typeof ToolDefinition>

/**
 * Agent tool call configuration schema
 */
export const AgentToolCallConfig = z.object({
  /** Agent provider to use */
  provider: AgentProvider,
  /** Model identifier (e.g., 'claude-3-sonnet', 'gemini-pro', 'gpt-4') */
  model: z.string().min(1),
  /** System prompt for the agent */
  systemPrompt: z.string().optional(),
  /** User message/prompt */
  prompt: z.string().min(1),
  /** Max tokens to generate */
  maxTokens: z.number().int().positive().optional(),
  /** Temperature for response randomness (0-1) */
  temperature: z.number().min(0).max(1).optional(),
  /** Tool calls that agent can make */
  tools: z.array(ToolDefinition).optional(),
  /** Context metadata as string */
  parentContext: z.string().optional(),
})
export type AgentToolCallConfig = z.infer<typeof AgentToolCallConfig>

/**
 * Tool call schema for agent responses
 */
export const AgentToolCall = z.object({
  name: z.string(),
  arguments: z.string(), // JSON string to avoid z.record issues
  result: z.string().optional(),
})
export type AgentToolCall = z.infer<typeof AgentToolCall>

/**
 * Usage statistics schema
 */
export const AgentUsage = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
})
export type AgentUsage = z.infer<typeof AgentUsage>

/**
 * Base agent response schema without nested responses
 */
export const BaseAgentResponse = z.object({
  /** Unique invocation ID */
  id: z.string(),
  /** Provider that handled the request */
  provider: AgentProvider,
  /** Model used for generation */
  model: z.string(),
  /** Generated content */
  content: z.string(),
  /** Structured data extracted from response as JSON string */
  structured: z.string().optional(),
  /** Tool calls made during invocation */
  toolCalls: z.array(AgentToolCall).optional(),
  /** Usage statistics */
  usage: AgentUsage.optional(),
  /** Duration of invocation in milliseconds */
  duration: z.number().int().nonnegative(),
  /** Timestamp of invocation */
  timestamp: z.string().datetime(),
  /** Error if invocation failed */
  error: z.string().optional(),
})
export type BaseAgentResponse = z.infer<typeof BaseAgentResponse>

/**
 * Agent response schema - keeping it simple without circular references for now
 */
export const AgentResponse = BaseAgentResponse.extend({
  /** Nested agent responses if any were invoked - limited to one level */
  nestedResponses: z.array(BaseAgentResponse).optional(),
})
export type AgentResponse = z.infer<typeof AgentResponse>

/**
 * Agent invocation status
 */
export const AgentStatus = z.enum(['pending', 'running', 'completed', 'error'])
export type AgentStatus = z.infer<typeof AgentStatus>

/**
 * Agent invocation state for tracking active calls
 */
export const AgentInvocationState = z.object({
  /** Invocation ID */
  id: z.string(),
  /** Current status */
  status: AgentStatus,
  /** Configuration used */
  config: AgentToolCallConfig,
  /** Response when available */
  response: AgentResponse.optional(),
  /** Start time */
  startTime: z.string().datetime(),
  /** End time when completed/failed */
  endTime: z.string().datetime().optional(),
  /** Parent invocation ID for nested calls */
  parentId: z.string().optional(),
  /** Child invocation IDs */
  childIds: z.array(z.string()).default([]),
})
export type AgentInvocationState = z.infer<typeof AgentInvocationState>