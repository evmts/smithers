/**
 * Gemini Agent Implementation (stub)
 * TODO: Implement actual Gemini agent logic
 */

import type { Agent, AgentInvocationRequest, AgentResponse } from '../types.js'
import { AgentType } from '../types.js'

export class GeminiAgent implements Agent {
  readonly type = AgentType.GEMINI

  constructor(_config: Record<string, unknown>) {
    // Configuration stored for future use
  }

  async invoke(request: AgentInvocationRequest): Promise<AgentResponse> {
    // Stub implementation
    return {
      success: true,
      result: `Gemini agent received prompt: ${request.prompt.slice(0, 50)}...`,
      agentType: 'gemini',
      executionTime: 0
    }
  }

  async isHealthy(): Promise<boolean> {
    return true
  }
}
