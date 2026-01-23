import { z } from 'zod'

// ============================================================================
// Agent Types Enum
// ============================================================================

export enum AgentType {
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  CODEX = 'codex'
}

// ============================================================================
// Tool Call Interface
// ============================================================================

export interface ToolCall {
  name: string
  input: any
  output: any
}

// ============================================================================
// Agent Invocation Request
// ============================================================================

export const AgentInvocationRequestSchema = z.object({
  agentType: z.enum(['claude', 'gemini', 'codex']),
  prompt: z.string(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  tools: z.array(z.string()).optional(),
  timeout: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

export type AgentInvocationRequest = z.infer<typeof AgentInvocationRequestSchema>

// ============================================================================
// Agent Response
// ============================================================================

export const AgentResponseSchema = z.object({
  success: z.boolean(),
  result: z.string().optional(),
  error: z.string().optional(),
  agentType: z.enum(['claude', 'gemini', 'codex']),
  executionTime: z.number().optional(),
  tokensUsed: z.number().optional(),
  toolCalls: z.array(z.object({
    name: z.string(),
    input: z.unknown(),
    output: z.unknown()
  })).optional()
})

export type AgentResponse = z.infer<typeof AgentResponseSchema>

// ============================================================================
// Agent Interface
// ============================================================================

export interface Agent {
  readonly type: AgentType
  invoke(request: AgentInvocationRequest): Promise<AgentResponse>
  isHealthy(): Promise<boolean>
}

// ============================================================================
// Agent Factory Interface
// ============================================================================

export interface AgentFactory {
  createAgent(type: AgentType): Agent
  getSupportedTypes(): AgentType[]
}

// ============================================================================
// Round Robin State
// ============================================================================

export interface RoundRobinState {
  currentIndex: number
  agentOrder: AgentType[]
  failureCounts: Record<AgentType, number>
  lastUsed: Record<AgentType, number>
}

// ============================================================================
// Validation Functions
// ============================================================================

export function validateAgentType(type: any): type is AgentType {
  return Object.values(AgentType).includes(type as AgentType)
}

export function validateInvocationRequest(request: any): request is AgentInvocationRequest {
  try {
    AgentInvocationRequestSchema.parse(request)
    return true
  } catch {
    return false
  }
}

export function validateAgentResponse(response: any): response is AgentResponse {
  try {
    AgentResponseSchema.parse(response)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  claude?: {
    model?: string
    apiKey?: string
    baseUrl?: string
  }
  gemini?: {
    model?: string
    apiKey?: string
    baseUrl?: string
  }
  codex?: {
    model?: string
    apiKey?: string
    baseUrl?: string
  }
}

// ============================================================================
// Delegation Strategy
// ============================================================================

export enum DelegationStrategy {
  ROUND_ROBIN = 'round_robin',
  LOAD_BALANCED = 'load_balanced',
  RANDOM = 'random',
  FAILOVER = 'failover'
}

export interface DelegationConfig {
  strategy: DelegationStrategy
  healthCheckInterval?: number
  maxRetries?: number
  retryDelay?: number
  failureThreshold?: number
}