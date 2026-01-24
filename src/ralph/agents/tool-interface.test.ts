import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createAgentTool, createInvokeAgentTool } from './tool-interface.js'
import type { AgentInvocationRequest, AgentResponse, Agent, AgentType } from './types.js'
import type { SmithersToolContext } from '../../tools/types.js'

describe('Agent Tool Interface', () => {
  let mockAgent: Agent
  let mockContext: SmithersToolContext

  beforeEach(() => {
    mockAgent = {
      type: 'claude' as AgentType,
      invoke: mock(async (request: AgentInvocationRequest): Promise<AgentResponse> => ({
        success: true,
        result: `Mocked response for: ${request.prompt}`,
        agentType: 'claude',
        executionTime: 1000,
        tokensUsed: 100
      })),
      isHealthy: mock(async () => true)
    }

    mockContext = {
      db: {} as any,
      agentId: 'test-agent-id',
      executionId: 'test-execution-id',
      cwd: '/test/cwd',
      env: { NODE_ENV: 'test' },
      log: mock(() => {})
    }
  })

  describe('createAgentTool', () => {
    test('creates tool with correct schema and metadata', () => {
      const tool = createAgentTool(mockAgent)

      expect(tool.name).toBe('invoke_claude_agent')
      expect(tool.description).toContain('claude')
      expect(tool.requiresSmithersContext).toBe(true)
      expect(tool.inputSchema).toBeDefined()
      expect(tool.outputSchema).toBeDefined()
    })

    test('validates input schema correctly', () => {
      const tool = createAgentTool(mockAgent)

      const validInput = {
        prompt: 'Test prompt',
        model: 'sonnet',
        maxTokens: 1000,
        temperature: 0.7,
        tools: ['bash', 'read'],
        timeout: 30000,
        metadata: { sessionId: 'test' }
      }

      expect(() => tool.inputSchema.parse(validInput)).not.toThrow()

      const invalidInput = {
        // Missing required prompt
        model: 'sonnet'
      }

      expect(() => tool.inputSchema.parse(invalidInput)).toThrow()
    })

    test('executes agent invocation successfully', async () => {
      const tool = createAgentTool(mockAgent)
      const input = {
        prompt: 'Test prompt',
        model: 'sonnet'
      }

      const result = await tool.execute(input, { smithers: mockContext })

      expect(mockAgent.invoke).toHaveBeenCalledWith({
        agentType: 'claude',
        prompt: 'Test prompt',
        model: 'sonnet'
      })

      expect(result).toEqual({
        success: true,
        result: 'Mocked response for: Test prompt',
        agentType: 'claude',
        executionTime: 1000,
        tokensUsed: 100
      })
    })

    test('handles agent invocation errors', async () => {
      const errorAgent: Agent = {
        ...mockAgent,
        invoke: mock(async () => {
          throw new Error('Agent invocation failed')
        })
      }

      const tool = createAgentTool(errorAgent)
      const input = { prompt: 'Test prompt' }

      const result = await tool.execute(input, { smithers: mockContext })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Agent invocation failed')
      expect(result.agentType).toBe('claude')
    })

    test('logs execution details', async () => {
      const tool = createAgentTool(mockAgent)
      const input = { prompt: 'Test prompt' }

      await tool.execute(input, { smithers: mockContext })

      expect(mockContext.log).toHaveBeenCalledWith(
        expect.stringContaining('Invoking claude agent')
      )
      expect(mockContext.log).toHaveBeenCalledWith(
        expect.stringContaining('Agent invocation completed')
      )
    })
  })

  describe('createInvokeAgentTool', () => {
    test('creates generic agent invocation tool', () => {
      const getAgent = mock((_type: AgentType) => mockAgent)
      const tool = createInvokeAgentTool(getAgent)

      expect(tool.name).toBe('invoke_agent')
      expect(tool.description).toContain('Invoke any available agent')
      expect(tool.requiresSmithersContext).toBe(true)
    })

    test('validates agent type in input', () => {
      const getAgent = mock((_type: AgentType) => mockAgent)
      const tool = createInvokeAgentTool(getAgent)

      const validInput = {
        agentType: 'claude' as const,
        prompt: 'Test prompt'
      }

      const invalidInput = {
        agentType: 'invalid' as any,
        prompt: 'Test prompt'
      }

      expect(() => tool.inputSchema.parse(validInput)).not.toThrow()
      expect(() => tool.inputSchema.parse(invalidInput)).toThrow()
    })

    test('delegates to correct agent based on type', async () => {
      const claudeAgent = { ...mockAgent, type: 'claude' as AgentType }
      const geminiAgent = { ...mockAgent, type: 'gemini' as AgentType }

      const getAgent = mock((type: AgentType) => {
        if (type === 'claude') return claudeAgent
        if (type === 'gemini') return geminiAgent
        throw new Error(`Unknown agent type: ${type}`)
      })

      const tool = createInvokeAgentTool(getAgent)

      const claudeInput = {
        agentType: 'claude' as const,
        prompt: 'Test Claude prompt'
      }

      const geminiInput = {
        agentType: 'gemini' as const,
        prompt: 'Test Gemini prompt'
      }

      await tool.execute(claudeInput, { smithers: mockContext })
      expect(getAgent).toHaveBeenCalledWith('claude')

      await tool.execute(geminiInput, { smithers: mockContext })
      expect(getAgent).toHaveBeenCalledWith('gemini')
    })

    test('handles agent retrieval errors', async () => {
      const getAgent = mock((type: AgentType) => {
        throw new Error(`Agent type ${type} not available`)
      })

      const tool = createInvokeAgentTool(getAgent)
      const input = {
        agentType: 'claude' as const,
        prompt: 'Test prompt'
      }

      const result = await tool.execute(input, { smithers: mockContext })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Agent type claude not available')
    })

    test('passes through all invocation parameters', async () => {
      const getAgent = mock((_type: AgentType) => mockAgent)
      const tool = createInvokeAgentTool(getAgent)

      const input = {
        agentType: 'claude' as const,
        prompt: 'Complex prompt',
        model: 'opus',
        maxTokens: 2000,
        temperature: 0.5,
        tools: ['bash', 'read', 'write'],
        timeout: 45000,
        metadata: {
          sessionId: 'session-123',
          userId: 'user-456'
        }
      }

      await tool.execute(input, { smithers: mockContext })

      expect(mockAgent.invoke).toHaveBeenCalledWith({
        agentType: 'claude',
        prompt: 'Complex prompt',
        model: 'opus',
        maxTokens: 2000,
        temperature: 0.5,
        tools: ['bash', 'read', 'write'],
        timeout: 45000,
        metadata: {
          sessionId: 'session-123',
          userId: 'user-456'
        }
      })
    })
  })
})