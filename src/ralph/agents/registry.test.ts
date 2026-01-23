import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { AgentRegistry } from './registry.js'
import type { Agent, AgentType, AgentConfig, AgentInvocationRequest, AgentResponse } from './types.js'

describe('AgentRegistry', () => {
  let registry: AgentRegistry
  let mockClaudeAgent: Agent
  let mockGeminiAgent: Agent
  let mockCodexAgent: Agent

  beforeEach(() => {
    mockClaudeAgent = {
      type: 'claude',
      invoke: mock(async (request: AgentInvocationRequest): Promise<AgentResponse> => ({
        success: true,
        result: `Claude response: ${request.prompt}`,
        agentType: 'claude',
        executionTime: 1000,
        tokensUsed: 100
      })),
      isHealthy: mock(async () => true)
    }

    mockGeminiAgent = {
      type: 'gemini',
      invoke: mock(async (request: AgentInvocationRequest): Promise<AgentResponse> => ({
        success: true,
        result: `Gemini response: ${request.prompt}`,
        agentType: 'gemini',
        executionTime: 800,
        tokensUsed: 80
      })),
      isHealthy: mock(async () => true)
    }

    mockCodexAgent = {
      type: 'codex',
      invoke: mock(async (request: AgentInvocationRequest): Promise<AgentResponse> => ({
        success: true,
        result: `Codex response: ${request.prompt}`,
        agentType: 'codex',
        executionTime: 1200,
        tokensUsed: 150
      })),
      isHealthy: mock(async () => true)
    }

    registry = new AgentRegistry()
  })

  describe('Registration', () => {
    test('registers agents correctly', () => {
      registry.register(mockClaudeAgent)
      registry.register(mockGeminiAgent)
      registry.register(mockCodexAgent)

      expect(registry.isRegistered('claude')).toBe(true)
      expect(registry.isRegistered('gemini')).toBe(true)
      expect(registry.isRegistered('codex')).toBe(true)
      expect(registry.isRegistered('unknown' as AgentType)).toBe(false)
    })

    test('returns supported types', () => {
      registry.register(mockClaudeAgent)
      registry.register(mockGeminiAgent)

      const supportedTypes = registry.getSupportedTypes()
      expect(supportedTypes).toContain('claude')
      expect(supportedTypes).toContain('gemini')
      expect(supportedTypes).not.toContain('codex')
    })

    test('replaces existing agent registration', () => {
      registry.register(mockClaudeAgent)

      const newClaudeAgent: Agent = {
        ...mockClaudeAgent,
        invoke: mock(async () => ({
          success: true,
          result: 'New Claude agent',
          agentType: 'claude'
        }))
      }

      registry.register(newClaudeAgent)
      const retrievedAgent = registry.getAgent('claude')
      expect(retrievedAgent).toBe(newClaudeAgent)
    })
  })

  describe('Agent Retrieval', () => {
    beforeEach(() => {
      registry.register(mockClaudeAgent)
      registry.register(mockGeminiAgent)
      registry.register(mockCodexAgent)
    })

    test('retrieves registered agents', () => {
      expect(registry.getAgent('claude')).toBe(mockClaudeAgent)
      expect(registry.getAgent('gemini')).toBe(mockGeminiAgent)
      expect(registry.getAgent('codex')).toBe(mockCodexAgent)
    })

    test('throws error for unregistered agent', () => {
      registry = new AgentRegistry()
      expect(() => registry.getAgent('claude')).toThrow('Agent type "claude" is not registered')
    })

    test('gets all registered agents', () => {
      const allAgents = registry.getAllAgents()
      expect(allAgents).toHaveLength(3)
      expect(allAgents).toContain(mockClaudeAgent)
      expect(allAgents).toContain(mockGeminiAgent)
      expect(allAgents).toContain(mockCodexAgent)
    })
  })

  describe('Health Checks', () => {
    beforeEach(() => {
      registry.register(mockClaudeAgent)
      registry.register(mockGeminiAgent)
    })

    test('checks health of single agent', async () => {
      const isHealthy = await registry.isAgentHealthy('claude')
      expect(isHealthy).toBe(true)
      expect(mockClaudeAgent.isHealthy).toHaveBeenCalled()
    })

    test('returns false for unhealthy agent', async () => {
      mockClaudeAgent.isHealthy = mock(async () => false)
      registry.register(mockClaudeAgent)

      const isHealthy = await registry.isAgentHealthy('claude')
      expect(isHealthy).toBe(false)
    })

    test('handles health check errors', async () => {
      mockClaudeAgent.isHealthy = mock(async () => {
        throw new Error('Health check failed')
      })
      registry.register(mockClaudeAgent)

      const isHealthy = await registry.isAgentHealthy('claude')
      expect(isHealthy).toBe(false)
    })

    test('checks health of all agents', async () => {
      const healthStatus = await registry.checkAllHealth()

      expect(healthStatus.claude).toBe(true)
      expect(healthStatus.gemini).toBe(true)
      expect(mockClaudeAgent.isHealthy).toHaveBeenCalled()
      expect(mockGeminiAgent.isHealthy).toHaveBeenCalled()
    })

    test('gets healthy agents only', async () => {
      mockGeminiAgent.isHealthy = mock(async () => false)
      registry.register(mockGeminiAgent)

      const healthyAgents = await registry.getHealthyAgents()
      expect(healthyAgents).toHaveLength(1)
      expect(healthyAgents[0]).toBe('claude')
    })
  })

  describe('Static Factory Methods', () => {
    test('creates registry with default agents (gracefully handles missing implementations)', async () => {
      const config: AgentConfig = {
        claude: { model: 'sonnet', apiKey: 'test-key' },
        gemini: { model: 'pro', apiKey: 'test-key' },
        codex: { model: 'davinci', apiKey: 'test-key' }
      }

      const defaultRegistry = await AgentRegistry.createWithDefaults(config)

      // Since implementations don't exist yet, should create empty registry gracefully
      expect(defaultRegistry.getSupportedTypes()).toHaveLength(0)
      expect(defaultRegistry.isRegistered('claude')).toBe(false)
      expect(defaultRegistry.isRegistered('gemini')).toBe(false)
      expect(defaultRegistry.isRegistered('codex')).toBe(false)
    })

    test('creates registry from configuration (gracefully handles missing implementations)', async () => {
      const config: AgentConfig = {
        claude: { model: 'sonnet' },
        gemini: { model: 'pro' }
        // codex intentionally omitted
      }

      const configRegistry = await AgentRegistry.fromConfig(config)

      // Since implementations don't exist yet, should create empty registry gracefully
      expect(configRegistry.getSupportedTypes()).toHaveLength(0)
      expect(configRegistry.isRegistered('claude')).toBe(false)
      expect(configRegistry.isRegistered('gemini')).toBe(false)
      expect(configRegistry.isRegistered('codex')).toBe(false)
    })
  })

  describe('Unregistration', () => {
    test('unregisters agents', () => {
      registry.register(mockClaudeAgent)
      registry.register(mockGeminiAgent)

      expect(registry.isRegistered('claude')).toBe(true)
      registry.unregister('claude')
      expect(registry.isRegistered('claude')).toBe(false)
      expect(registry.isRegistered('gemini')).toBe(true)
    })

    test('clears all agents', () => {
      registry.register(mockClaudeAgent)
      registry.register(mockGeminiAgent)
      registry.register(mockCodexAgent)

      expect(registry.getSupportedTypes()).toHaveLength(3)
      registry.clear()
      expect(registry.getSupportedTypes()).toHaveLength(0)
    })
  })

  describe('Error Handling', () => {
    test('handles errors gracefully during agent creation', async () => {
      const invalidConfig: AgentConfig = {
        claude: { apiKey: '' } // Invalid configuration
      }

      // Should not throw, but should create empty registry
      const emptyRegistry = await AgentRegistry.fromConfig(invalidConfig)
      expect(emptyRegistry.getSupportedTypes()).toHaveLength(0)
    })
  })
})