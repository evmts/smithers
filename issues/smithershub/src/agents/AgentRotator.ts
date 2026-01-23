/**
 * AgentRotator - Core round-robin logic for agent selection and rotation
 * Handles deterministic agent rotation with state management and serialization
 */

import type { RoundRobinAgent } from '../hooks/useRoundRobin'

export interface RotationStats {
  currentIndex: number
  totalAgents: number
  rotationCount: number
  lastRotationTime: number | null
}

export interface SerializedRotatorState {
  currentIndex: number
  rotationCount: number
  lastRotationTime: number | null
  version: number
}

/**
 * Thread-safe round-robin agent rotator
 * Provides deterministic agent selection with state persistence
 */
export class AgentRotator {
  private agents: RoundRobinAgent[]
  private currentIndex: number = 0
  private rotationCount: number = 0
  private lastRotationTime: number | null = null

  constructor(agents: RoundRobinAgent[] = []) {
    this.agents = [...agents] // Defensive copy
    this.validateAgents()
  }

  /**
   * Validate agent list for consistency
   */
  private validateAgents() {
    if (this.agents.length === 0) return

    // Check for duplicate IDs
    const ids = new Set(this.agents.map(a => a.id))
    if (ids.size !== this.agents.length) {
      throw new Error('Duplicate agent IDs detected')
    }

    // Validate agent structure
    for (const agent of this.agents) {
      if (!agent.id || !agent.name || !agent.type) {
        throw new Error('Invalid agent structure: missing required fields')
      }
    }
  }

  /**
   * Get the next agent in round-robin sequence
   * Updates internal state and returns the selected agent
   */
  getNext(): RoundRobinAgent | null {
    if (this.agents.length === 0) {
      return null
    }

    const agent = this.agents[this.currentIndex]

    // Update rotation state
    this.rotationCount++
    this.lastRotationTime = Date.now()

    // Advance to next agent (with wrap-around)
    this.currentIndex = (this.currentIndex + 1) % this.agents.length

    return agent
  }

  /**
   * Get current agent without advancing rotation
   */
  getCurrentAgent(): RoundRobinAgent | null {
    if (this.agents.length === 0) {
      return null
    }
    return this.agents[this.currentIndex]
  }

  /**
   * Get current rotation index
   */
  getCurrentIndex(): number {
    return this.currentIndex
  }

  /**
   * Get total number of agents
   */
  getTotalAgents(): number {
    return this.agents.length
  }

  /**
   * Set current index with bounds checking
   */
  setCurrentIndex(index: number): void {
    if (!Number.isInteger(index)) {
      throw new Error('Index must be an integer')
    }

    if (this.agents.length === 0) {
      this.currentIndex = 0
      return
    }

    if (index < 0 || index >= this.agents.length) {
      throw new Error(`Index ${index} out of bounds for ${this.agents.length} agents`)
    }

    this.currentIndex = index
  }

  /**
   * Reset rotation to first agent
   */
  reset(): void {
    this.currentIndex = 0
    this.rotationCount = 0
    this.lastRotationTime = null
  }

  /**
   * Update agents list and reset rotation
   */
  updateAgents(agents: RoundRobinAgent[]): void {
    this.agents = [...agents] // Defensive copy
    this.validateAgents()
    this.reset()
  }

  /**
   * Get agents filtered by type
   */
  getAgentsByType(type: string): RoundRobinAgent[] {
    return this.agents.filter(agent => agent.type === type)
  }

  /**
   * Find agent by ID
   */
  getAgentById(id: string): RoundRobinAgent | null {
    return this.agents.find(agent => agent.id === id) || null
  }

  /**
   * Get all agents (defensive copy)
   */
  getAllAgents(): RoundRobinAgent[] {
    return [...this.agents]
  }

  /**
   * Get rotation statistics
   */
  getRotationStats(): RotationStats {
    return {
      currentIndex: this.currentIndex,
      totalAgents: this.agents.length,
      rotationCount: this.rotationCount,
      lastRotationTime: this.lastRotationTime,
    }
  }

  /**
   * Check if specific agent is currently selected
   */
  isCurrentAgent(agentId: string): boolean {
    const current = this.getCurrentAgent()
    return current?.id === agentId
  }

  /**
   * Get next N agents in rotation order (without advancing state)
   */
  peekNext(count: number): RoundRobinAgent[] {
    if (this.agents.length === 0 || count <= 0) {
      return []
    }

    const result: RoundRobinAgent[] = []
    let index = this.currentIndex

    for (let i = 0; i < Math.min(count, this.agents.length); i++) {
      result.push(this.agents[index])
      index = (index + 1) % this.agents.length
    }

    return result
  }

  /**
   * Calculate expected executions per agent for given total executions
   */
  calculateExecutionDistribution(totalExecutions: number): Map<string, number> {
    const distribution = new Map<string, number>()

    if (this.agents.length === 0 || totalExecutions <= 0) {
      return distribution
    }

    const baseExecutions = Math.floor(totalExecutions / this.agents.length)
    const remainder = totalExecutions % this.agents.length

    // Initialize all agents with base executions
    for (const agent of this.agents) {
      distribution.set(agent.id, baseExecutions)
    }

    // Distribute remainder starting from first agent
    for (let i = 0; i < remainder; i++) {
      const agent = this.agents[i]
      distribution.set(agent.id, distribution.get(agent.id)! + 1)
    }

    return distribution
  }

  /**
   * Serialize rotator state for persistence
   */
  serialize(): SerializedRotatorState {
    return {
      currentIndex: this.currentIndex,
      rotationCount: this.rotationCount,
      lastRotationTime: this.lastRotationTime,
      version: 1, // For future compatibility
    }
  }

  /**
   * Create rotator from serialized state
   */
  static deserialize(
    state: SerializedRotatorState,
    agents: RoundRobinAgent[]
  ): AgentRotator {
    const rotator = new AgentRotator(agents)

    // Validate state version
    if (state.version !== 1) {
      console.warn(`Unsupported rotator state version: ${state.version}, using defaults`)
      return rotator
    }

    // Restore state with bounds checking
    if (state.currentIndex >= 0 && state.currentIndex < agents.length) {
      rotator.currentIndex = state.currentIndex
    }

    rotator.rotationCount = Math.max(0, state.rotationCount || 0)
    rotator.lastRotationTime = state.lastRotationTime

    return rotator
  }

  /**
   * Create a new rotator with filtered agents
   * Useful for type-based filtering while maintaining rotation state
   */
  createFilteredRotator(
    predicate: (agent: RoundRobinAgent) => boolean
  ): AgentRotator {
    const filteredAgents = this.agents.filter(predicate)
    const newRotator = new AgentRotator(filteredAgents)

    // Try to maintain relative position if possible
    const currentAgent = this.getCurrentAgent()
    if (currentAgent && filteredAgents.some(a => a.id === currentAgent.id)) {
      const newIndex = filteredAgents.findIndex(a => a.id === currentAgent.id)
      if (newIndex >= 0) {
        newRotator.currentIndex = newIndex
      }
    }

    return newRotator
  }

  /**
   * Debug information for troubleshooting
   */
  getDebugInfo(): object {
    return {
      agentCount: this.agents.length,
      agentIds: this.agents.map(a => a.id),
      currentIndex: this.currentIndex,
      currentAgentId: this.getCurrentAgent()?.id || null,
      rotationCount: this.rotationCount,
      lastRotationTime: this.lastRotationTime,
    }
  }
}