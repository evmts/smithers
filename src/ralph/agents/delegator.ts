import type { AgentRegistry } from './registry.js'
import type { AgentType, AgentInvocationRequest, AgentResponse, RoundRobinState, DelegationConfig } from './types.js'
import { DelegationStrategy } from './types.js'
import type { SmithersDB } from '../../db/index.js'

// ============================================================================
// Round Robin Delegator Implementation
// ============================================================================

/**
 * Implements round-robin delegation across multiple agents with health checking,
 * failure tracking, and persistent state management
 */
export class RoundRobinDelegator {
  private static readonly STATE_KEY = 'ralph.round_robin_state'

  private state: RoundRobinState
  private config: DelegationConfig

  constructor(
    private registry: AgentRegistry,
    private db: SmithersDB,
    config?: Partial<DelegationConfig>
  ) {
    this.config = {
      strategy: DelegationStrategy.ROUND_ROBIN,
      maxRetries: 3,
      retryDelay: 1000,
      failureThreshold: 5,
      healthCheckInterval: 60000,
      ...config
    }

    this.state = this.loadState()
  }

  // ============================================================================
  // Delegation Logic
  // ============================================================================

  /**
   * Delegate a request to the next available agent in round-robin order
   * @param request The agent invocation request
   * @returns Promise resolving to agent response
   */
  async delegate(request: AgentInvocationRequest): Promise<AgentResponse> {
    const availableAgents = this.registry.getSupportedTypes()

    if (availableAgents.length === 0) {
      return {
        success: false,
        error: 'No agents registered in the registry',
        agentType: request.agentType,
        executionTime: 0
      }
    }

    // Update agent order if registry has changed
    this.updateAgentOrder(availableAgents)

    let lastError = 'Unknown error occurred'
    let attemptsCount = 0
    const maxAttempts = Math.min(this.config.maxRetries! + 1, this.state.agentOrder.length)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const agentType = await this.selectNextAgent()

      if (!agentType) {
        return {
          success: false,
          error: 'No healthy agents available',
          agentType: request.agentType,
          executionTime: 0
        }
      }

      try {
        attemptsCount++
        const agent = this.registry.getAgent(agentType)

        // Update request with selected agent type
        const delegatedRequest: AgentInvocationRequest = {
          ...request,
          agentType
        }

        const startTime = Date.now()
        const response = await agent.invoke(delegatedRequest)
        const executionTime = Date.now() - startTime

        // Track success/failure
        if (response.success) {
          this.recordSuccess(agentType)
          this.moveToNext()
          this.saveState()
          return {
            ...response,
            executionTime: response.executionTime ?? executionTime
          }
        } else {
          this.recordFailure(agentType)
          lastError = response.error || 'Agent returned unsuccessful response'

          if (attempt < maxAttempts - 1) {
            await this.delay(this.config.retryDelay!)
          }
        }
      } catch (error) {
        this.recordFailure(agentType)
        lastError = error instanceof Error ? error.message : 'Unknown error occurred'

        if (attempt < maxAttempts - 1) {
          await this.delay(this.config.retryDelay!)
        }
      }
    }

    this.saveState()

    return {
      success: false,
      error: `All agents failed after ${attemptsCount} attempts. Last error: ${lastError}`,
      agentType: request.agentType,
      executionTime: 0
    }
  }

  // ============================================================================
  // Agent Selection Logic
  // ============================================================================

  /**
   * Select the next healthy agent in round-robin order
   * @returns Promise resolving to next agent type or null if none available
   */
  private async selectNextAgent(): Promise<AgentType | null> {
    const healthyAgents = await this.registry.getHealthyAgents()

    if (healthyAgents.length === 0) {
      return null
    }

    // Filter by health and failure threshold
    const availableAgents = healthyAgents.filter(agentType => {
      const failureCount = this.state.failureCounts[agentType] || 0
      return failureCount < this.config.failureThreshold!
    })

    if (availableAgents.length === 0) {
      // If all agents exceed failure threshold, reset failure counts and try again
      this.resetFailureCounts()
      return this.selectNextAgent()
    }

    // Find next agent in round-robin order that's available
    let attempts = 0
    while (attempts < this.state.agentOrder.length) {
      const candidateAgent = this.state.agentOrder[this.state.currentIndex]

      if (availableAgents.includes(candidateAgent)) {
        return candidateAgent
      }

      this.moveToNext()
      attempts++
    }

    // Fallback to first available agent
    return availableAgents[0] || null
  }

  /**
   * Move to next agent in round-robin order
   */
  private moveToNext(): void {
    this.state.currentIndex = (this.state.currentIndex + 1) % this.state.agentOrder.length
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Load round-robin state from database
   * @returns Loaded state or default state
   */
  private loadState(): RoundRobinState {
    try {
      const saved = this.db.db.get<{ value: string }>(
        'SELECT value FROM state WHERE key = ?',
        [RoundRobinDelegator.STATE_KEY]
      )

      if (saved?.value) {
        const parsedState = JSON.parse(saved.value) as RoundRobinState

        // Validate and update agent order if needed
        const currentAgents = this.registry.getSupportedTypes()
        if (!this.arraysEqual(parsedState.agentOrder, currentAgents)) {
          parsedState.agentOrder = currentAgents
          parsedState.currentIndex = 0
        }

        return parsedState
      }
    } catch (error) {
      console.warn('Failed to load round-robin state:', error)
    }

    return this.createDefaultState()
  }

  /**
   * Save current state to database
   */
  private saveState(): void {
    try {
      this.db.db.run(
        'INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)',
        [RoundRobinDelegator.STATE_KEY, JSON.stringify(this.state)]
      )
    } catch (error) {
      console.warn('Failed to save round-robin state:', error)
    }
  }

  /**
   * Create default state for current registry
   */
  private createDefaultState(): RoundRobinState {
    const agentOrder = this.registry.getSupportedTypes()
    const failureCounts: Record<AgentType, number> = {} as Record<AgentType, number>
    const lastUsed: Record<AgentType, number> = {} as Record<AgentType, number>

    for (const agentType of agentOrder) {
      failureCounts[agentType] = 0
      lastUsed[agentType] = 0
    }

    return {
      currentIndex: 0,
      agentOrder,
      failureCounts,
      lastUsed
    }
  }

  /**
   * Update agent order based on current registry
   * @param availableAgents Current available agent types
   */
  private updateAgentOrder(availableAgents: AgentType[]): void {
    if (!this.arraysEqual(this.state.agentOrder, availableAgents)) {
      const oldOrder = [...this.state.agentOrder]
      this.state.agentOrder = availableAgents

      // Preserve failure counts and last used times for existing agents
      const newFailureCounts: Record<AgentType, number> = {} as Record<AgentType, number>
      const newLastUsed: Record<AgentType, number> = {} as Record<AgentType, number>

      for (const agentType of availableAgents) {
        newFailureCounts[agentType] = this.state.failureCounts[agentType] || 0
        newLastUsed[agentType] = this.state.lastUsed[agentType] || 0
      }

      this.state.failureCounts = newFailureCounts
      this.state.lastUsed = newLastUsed

      // Adjust current index if needed
      if (this.state.currentIndex >= availableAgents.length) {
        this.state.currentIndex = 0
      }
    }
  }

  // ============================================================================
  // Failure Tracking
  // ============================================================================

  /**
   * Record a successful agent invocation
   * @param agentType Agent that succeeded
   */
  private recordSuccess(agentType: AgentType): void {
    this.state.failureCounts[agentType] = 0
    this.state.lastUsed[agentType] = Date.now()
  }

  /**
   * Record a failed agent invocation
   * @param agentType Agent that failed
   */
  private recordFailure(agentType: AgentType): void {
    this.state.failureCounts[agentType] = (this.state.failureCounts[agentType] || 0) + 1
    this.state.lastUsed[agentType] = Date.now()
  }

  /**
   * Reset failure counts for all agents
   */
  private resetFailureCounts(): void {
    for (const agentType of this.state.agentOrder) {
      this.state.failureCounts[agentType] = 0
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Delay execution for specified milliseconds
   * @param ms Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Check if two arrays are equal
   * @param a First array
   * @param b Second array
   * @returns True if arrays are equal
   */
  private arraysEqual(a: any[], b: any[]): boolean {
    return a.length === b.length && a.every((val, index) => val === b[index])
  }

  // ============================================================================
  // Public State Access
  // ============================================================================

  /**
   * Get current delegation state
   * @returns Current round-robin state
   */
  getState(): RoundRobinState {
    return { ...this.state }
  }

  /**
   * Set delegation state (for testing/management)
   * @param newState New state to set
   */
  setState(newState: RoundRobinState): void {
    this.state = newState
    this.saveState()
  }

  /**
   * Reset delegation state to defaults
   */
  resetState(): void {
    this.state = this.createDefaultState()
    this.saveState()
  }

  /**
   * Get current delegation configuration
   * @returns Current delegation config
   */
  getConfig(): DelegationConfig {
    return { ...this.config }
  }
}