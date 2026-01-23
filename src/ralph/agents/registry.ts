import type { Agent, AgentType, AgentConfig } from './types.js'

// ============================================================================
// Agent Registry Implementation
// ============================================================================

/**
 * Registry for managing multiple AI agents (Claude, Gemini, Codex)
 * Provides registration, health checking, and agent retrieval functionality
 */
export class AgentRegistry {
  private agents = new Map<AgentType, Agent>()

  // ============================================================================
  // Registration Methods
  // ============================================================================

  /**
   * Register an agent instance
   * @param agent The agent to register
   */
  register(agent: Agent): void {
    this.agents.set(agent.type, agent)
  }

  /**
   * Check if an agent type is registered
   * @param type Agent type to check
   * @returns True if registered
   */
  isRegistered(type: AgentType): boolean {
    return this.agents.has(type)
  }

  /**
   * Unregister an agent
   * @param type Agent type to unregister
   */
  unregister(type: AgentType): void {
    this.agents.delete(type)
  }

  /**
   * Clear all registered agents
   */
  clear(): void {
    this.agents.clear()
  }

  // ============================================================================
  // Agent Retrieval
  // ============================================================================

  /**
   * Get a registered agent by type
   * @param type Agent type to retrieve
   * @returns The agent instance
   * @throws Error if agent type is not registered
   */
  getAgent(type: AgentType): Agent {
    const agent = this.agents.get(type)
    if (!agent) {
      throw new Error(`Agent type "${type}" is not registered`)
    }
    return agent
  }

  /**
   * Get all registered agents
   * @returns Array of all agent instances
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get supported agent types
   * @returns Array of registered agent types
   */
  getSupportedTypes(): AgentType[] {
    return Array.from(this.agents.keys())
  }

  // ============================================================================
  // Health Checking
  // ============================================================================

  /**
   * Check if a specific agent is healthy
   * @param type Agent type to check
   * @returns Promise resolving to health status
   */
  async isAgentHealthy(type: AgentType): Promise<boolean> {
    try {
      const agent = this.getAgent(type)
      return await agent.isHealthy()
    } catch (error) {
      console.warn(`Health check failed for agent ${type}:`, error)
      return false
    }
  }

  /**
   * Check health of all registered agents
   * @returns Promise resolving to health status map
   */
  async checkAllHealth(): Promise<Record<AgentType, boolean>> {
    const healthStatus: Partial<Record<AgentType, boolean>> = {}

    const healthChecks = Array.from(this.agents.entries()).map(
      async ([type, agent]) => {
        try {
          const isHealthy = await agent.isHealthy()
          healthStatus[type] = isHealthy
        } catch (error) {
          console.warn(`Health check failed for agent ${type}:`, error)
          healthStatus[type] = false
        }
      }
    )

    await Promise.all(healthChecks)
    return healthStatus as Record<AgentType, boolean>
  }

  /**
   * Get only the healthy agents
   * @returns Promise resolving to array of healthy agent types
   */
  async getHealthyAgents(): Promise<AgentType[]> {
    const healthStatus = await this.checkAllHealth()
    return Object.entries(healthStatus)
      .filter(([, isHealthy]) => isHealthy)
      .map(([type]) => type as AgentType)
  }

  // ============================================================================
  // Static Factory Methods
  // ============================================================================

  /**
   * Create a registry with default agent implementations
   * @param config Configuration for agent creation
   * @returns Promise resolving to configured registry
   */
  static async createWithDefaults(config: AgentConfig): Promise<AgentRegistry> {
    const registry = new AgentRegistry()

    // Register Claude agent if configured
    if (config.claude) {
      try {
        const claudeAgent = await createClaudeAgent(config.claude)
        registry.register(claudeAgent)
      } catch (error) {
        console.warn('Failed to create Claude agent:', error)
      }
    }

    // Register Gemini agent if configured
    if (config.gemini) {
      try {
        const geminiAgent = await createGeminiAgent(config.gemini)
        registry.register(geminiAgent)
      } catch (error) {
        console.warn('Failed to create Gemini agent:', error)
      }
    }

    // Register Codex agent if configured
    if (config.codex) {
      try {
        const codexAgent = await createCodexAgent(config.codex)
        registry.register(codexAgent)
      } catch (error) {
        console.warn('Failed to create Codex agent:', error)
      }
    }

    return registry
  }

  /**
   * Create registry from configuration, only registering available agents
   * @param config Agent configuration
   * @returns Promise resolving to registry with available agents
   */
  static async fromConfig(config: AgentConfig): Promise<AgentRegistry> {
    return this.createWithDefaults(config)
  }

  // ============================================================================
  // Agent Factory Functions
  // ============================================================================

  /**
   * Get the agent factory function for dependency injection
   * @returns Function that retrieves agents by type
   */
  getAgentFactory(): (type: AgentType) => Agent {
    return (type: AgentType) => this.getAgent(type)
  }
}

// ============================================================================
// Agent Creation Functions
// ============================================================================

/**
 * Create a Claude agent instance
 * @param config Claude configuration
 * @returns Promise resolving to Claude agent
 */
async function createClaudeAgent(config: NonNullable<AgentConfig['claude']>): Promise<Agent> {
  // Import Claude agent implementation
  const { ClaudeAgent } = await import('./implementations/claude-agent.js')
  return new ClaudeAgent(config)
}

/**
 * Create a Gemini agent instance
 * @param config Gemini configuration
 * @returns Promise resolving to Gemini agent
 */
async function createGeminiAgent(config: NonNullable<AgentConfig['gemini']>): Promise<Agent> {
  // Import Gemini agent implementation
  const { GeminiAgent } = await import('./implementations/gemini-agent.js')
  return new GeminiAgent(config)
}

/**
 * Create a Codex agent instance
 * @param config Codex configuration
 * @returns Promise resolving to Codex agent
 */
async function createCodexAgent(config: NonNullable<AgentConfig['codex']>): Promise<Agent> {
  // Import Codex agent implementation
  const { CodexAgent } = await import('./implementations/codex-agent.js')
  return new CodexAgent(config)
}