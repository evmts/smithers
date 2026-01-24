/**
 * Claude Agent Implementation (stub)
 * TODO: Implement actual Claude agent logic
 */

import type { Agent, AgentInvocationRequest, AgentResponse } from '../types.js'
import { AgentType } from '../types.js'

export class ClaudeAgent implements Agent {
  readonly type = AgentType.CLAUDE

  constructor(_config: Record<string, unknown>) {
    // Configuration stored for future use
  }

  async invoke(request: AgentInvocationRequest): Promise<AgentResponse> {
    // Stub implementation
    return {
      success: true,
      result: `Claude agent received prompt: ${request.prompt.slice(0, 50)}...`,
      agentType: 'claude',
      executionTime: 0
    }
  }

  async isHealthy(): Promise<boolean> {
    return true
  }
}
