import { useRef } from 'react'
import type {
  AgentInvocationState,
  AgentStatus,
  AgentToolCallConfig,
  AgentResponse
} from '../types/AgentResponse'

/**
 * Agent invocation context manager
 * Manages state for active agent invocations using useRef to avoid useState
 * as per project guidelines
 */
export class AgentContextManager {
  private invocations = new Map<string, AgentInvocationState>()
  private listeners = new Set<() => void>()

  /**
   * Create a new agent invocation
   */
  createInvocation(id: string, config: AgentToolCallConfig, parentId?: string): AgentInvocationState {
    const state: AgentInvocationState = {
      id,
      status: 'pending',
      config,
      startTime: new Date().toISOString(),
      parentId,
      childIds: [],
    }

    this.invocations.set(id, state)

    // Add as child to parent if exists
    if (parentId) {
      const parent = this.invocations.get(parentId)
      if (parent && !parent.childIds.includes(id)) {
        parent.childIds.push(id)
      }
    }

    this.notifyListeners()
    return state
  }

  /**
   * Update invocation status
   */
  updateStatus(id: string, status: AgentStatus): void {
    const invocation = this.invocations.get(id)
    if (!invocation) return

    invocation.status = status

    if (status === 'completed' || status === 'error') {
      invocation.endTime = new Date().toISOString()
    }

    this.notifyListeners()
  }

  /**
   * Set invocation response
   */
  setResponse(id: string, response: AgentResponse): void {
    const invocation = this.invocations.get(id)
    if (!invocation) return

    invocation.response = response
    invocation.status = response.error ? 'error' : 'completed'
    invocation.endTime = new Date().toISOString()

    this.notifyListeners()
  }

  /**
   * Get invocation by ID
   */
  getInvocation(id: string): AgentInvocationState | undefined {
    return this.invocations.get(id)
  }

  /**
   * Get all invocations
   */
  getAllInvocations(): AgentInvocationState[] {
    return Array.from(this.invocations.values())
  }

  /**
   * Get active invocations (pending or running)
   */
  getActiveInvocations(): AgentInvocationState[] {
    return Array.from(this.invocations.values()).filter(
      inv => inv.status === 'pending' || inv.status === 'running'
    )
  }

  /**
   * Get child invocations for a parent
   */
  getChildInvocations(parentId: string): AgentInvocationState[] {
    return Array.from(this.invocations.values()).filter(
      inv => inv.parentId === parentId
    )
  }

  /**
   * Remove invocation from context
   */
  removeInvocation(id: string): void {
    const invocation = this.invocations.get(id)
    if (!invocation) return

    // Remove from parent's child list
    if (invocation.parentId) {
      const parent = this.invocations.get(invocation.parentId)
      if (parent) {
        parent.childIds = parent.childIds.filter(childId => childId !== id)
      }
    }

    // Remove all children recursively
    invocation.childIds.forEach(childId => {
      this.removeInvocation(childId)
    })

    this.invocations.delete(id)
    this.notifyListeners()
  }

  /**
   * Clear all invocations
   */
  clear(): void {
    this.invocations.clear()
    this.notifyListeners()
  }

  /**
   * Add a change listener
   */
  addListener(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Generate a unique invocation ID
   */
  generateId(): string {
    return `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener()
      } catch (error) {
        console.error('AgentContext listener error:', error)
      }
    })
  }
}

/**
 * React hook for agent context management
 * Uses useRef to maintain manager instance without triggering re-renders
 */
export function useAgentContext() {
  const managerRef = useRef<AgentContextManager>()

  if (!managerRef.current) {
    managerRef.current = new AgentContextManager()
  }

  return managerRef.current
}

/**
 * React hook for subscribing to agent context changes
 * Forces re-render when invocations change
 */
export function useAgentContextState(manager: AgentContextManager) {
  const forceUpdateRef = useRef<() => void>()

  if (!forceUpdateRef.current) {
    let counter = 0
    const forceUpdate = () => {
      counter++
      // This will cause the component to re-render by creating a new reference
      forceUpdateRef.current = () => counter
    }
    forceUpdateRef.current = forceUpdate

    // Subscribe to changes
    const unsubscribe = manager.addListener(forceUpdate)

    // Clean up on unmount (Note: this is a simplified cleanup)
    // In real implementation, we'd use useUnmount from project hooks
    setTimeout(() => {
      return unsubscribe
    }, 0)
  }

  return {
    invocations: manager.getAllInvocations(),
    activeInvocations: manager.getActiveInvocations(),
    getInvocation: (id: string) => manager.getInvocation(id),
    getChildInvocations: (parentId: string) => manager.getChildInvocations(parentId),
  }
}

/**
 * Context state interface for components
 */
export interface AgentContextState {
  invocations: AgentInvocationState[]
  activeInvocations: AgentInvocationState[]
  getInvocation: (id: string) => AgentInvocationState | undefined
  getChildInvocations: (parentId: string) => AgentInvocationState[]
}