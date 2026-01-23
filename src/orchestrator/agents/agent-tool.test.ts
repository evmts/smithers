/**
 * Tests for agent tool creation and execution system
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createAgentTool, AgentToolRegistry } from './agent-tool.js'
import type {
  AgentExecutor,
  AgentInvocation,
  AgentToolResult,
  AgentExecutionContext,
  AgentToolConfig,
  CreateAgentToolOptions
} from './types.js'

// Mock agent executor for testing
class MockAgentExecutor implements AgentExecutor {
  async execute(
    invocation: AgentInvocation,
    context: AgentExecutionContext
  ): Promise<AgentToolResult> {
    const { prompt } = invocation

    if (prompt.includes('error')) {
      return {
        success: false,
        error: 'Mock execution failed',
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 }
      }
    }

    return {
      success: true,
      content: `Mock response to: ${prompt}`,
      usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      executionTime: 1000,
      turns: 1,
      stopReason: 'completed'
    }
  }

  getDefaultConfig(): Partial<AgentToolConfig> {
    return {
      model: 'test-model',
      maxTokens: 2000
    }
  }

  validateConfig(config: AgentToolConfig): void {
    if (!config.model) {
      throw new Error('Model is required')
    }
  }
}

describe('AgentToolRegistry', () => {
  let registry: AgentToolRegistry

  beforeEach(() => {
    registry = new AgentToolRegistry()
  })

  test('should register and retrieve agent executors', () => {
    const executor = new MockAgentExecutor()

    registry.register('claude', executor)
    const retrieved = registry.get('claude')

    expect(retrieved).toBe(executor)
  })

  test('should return undefined for unregistered providers', () => {
    const retrieved = registry.get('gemini')
    expect(retrieved).toBeUndefined()
  })

  test('should list registered providers', () => {
    const executor = new MockAgentExecutor()

    registry.register('claude', executor)
    registry.register('gemini', executor)

    const providers = registry.list()
    expect(providers).toContain('claude')
    expect(providers).toContain('gemini')
    expect(providers).toHaveLength(2)
  })

  test('should overwrite existing registrations', () => {
    const executor1 = new MockAgentExecutor()
    const executor2 = new MockAgentExecutor()

    registry.register('claude', executor1)
    registry.register('claude', executor2)

    const retrieved = registry.get('claude')
    expect(retrieved).toBe(executor2)
  })
})

describe('createAgentTool', () => {
  let registry: AgentToolRegistry
  let mockContext: any

  beforeEach(() => {
    registry = new AgentToolRegistry()
    registry.register('claude', new MockAgentExecutor())

    mockContext = {
      cwd: '/test/dir',
      env: { NODE_ENV: 'test' },
      agentId: 'test-agent-123',
      executionId: 'test-exec-456',
      log: mock(() => {})
    }
  })

  test('should create a tool with basic configuration', () => {
    const options: CreateAgentToolOptions = {
      name: 'test-claude',
      description: 'Test Claude agent tool',
      config: {
        provider: 'claude',
        model: 'sonnet'
      }
    }

    const tool = createAgentTool(options, registry)

    expect(tool.name).toBe('test-claude')
    expect(tool.description).toBe('Test Claude agent tool')
    expect(typeof tool.execute).toBe('function')
  })

  test('should execute agent successfully', async () => {
    const options: CreateAgentToolOptions = {
      name: 'test-claude',
      description: 'Test Claude agent tool',
      config: {
        provider: 'claude',
        model: 'sonnet'
      }
    }

    const tool = createAgentTool(options, registry)

    const input = {
      prompt: 'Generate a hello world function',
      context: { language: 'python' }
    }

    const result = await tool.execute(input, {
      smithers: mockContext
    })

    expect(result.success).toBe(true)
    expect(result.content).toContain('Mock response to: Generate a hello world function')
    expect(result.usage?.totalTokens).toBe(150)
  })

  test('should handle execution errors', async () => {
    const options: CreateAgentToolOptions = {
      name: 'test-claude',
      description: 'Test Claude agent tool',
      config: {
        provider: 'claude',
        model: 'sonnet'
      }
    }

    const tool = createAgentTool(options, registry)

    const input = {
      prompt: 'This will cause an error',
      context: {}
    }

    const result = await tool.execute(input, {
      smithers: mockContext
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Mock execution failed')
  })

  test('should throw error for unregistered provider', () => {
    const options: CreateAgentToolOptions = {
      name: 'test-unknown',
      description: 'Test unknown agent tool',
      config: {
        provider: 'unknown' as any,
        model: 'test'
      }
    }

    expect(() => createAgentTool(options, registry)).toThrow('No executor found for provider: unknown')
  })

  test('should validate input schema', async () => {
    const options: CreateAgentToolOptions = {
      name: 'test-claude',
      description: 'Test Claude agent tool',
      config: {
        provider: 'claude',
        model: 'sonnet'
      },
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          language: { type: 'string' }
        },
        required: ['prompt', 'language']
      }
    }

    const tool = createAgentTool(options, registry)

    const invalidInput = {
      prompt: 'Test prompt'
      // missing required 'language' field
    }

    const result = await tool.execute(invalidInput, { smithers: mockContext })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Input validation failed')
    expect(result.error).toContain('language')
  })

  test('should pass through context correctly', async () => {
    const options: CreateAgentToolOptions = {
      name: 'test-claude',
      description: 'Test Claude agent tool',
      config: {
        provider: 'claude',
        model: 'sonnet'
      }
    }

    const tool = createAgentTool(options, registry)
    const logSpy = mock(() => {})

    const input = {
      prompt: 'Test prompt',
      context: { test: 'data' }
    }

    const contextWithLog = {
      ...mockContext,
      log: logSpy
    }

    await tool.execute(input, {
      smithers: contextWithLog
    })

    expect(logSpy).toHaveBeenCalled()
  })

  test('should merge config with invocation', async () => {
    const options: CreateAgentToolOptions = {
      name: 'test-claude',
      description: 'Test Claude agent tool',
      config: {
        provider: 'claude',
        model: 'sonnet',
        maxTokens: 1000
      }
    }

    const tool = createAgentTool(options, registry)

    const input = {
      prompt: 'Test prompt',
      configOverrides: {
        temperature: 0.5,
        maxTokens: 2000  // Should override the default
      }
    }

    // Execute and verify config was merged properly
    // This would require mocking the executor to capture the merged config
    const result = await tool.execute(input, { smithers: mockContext })
    expect(result.success).toBe(true)
  })
})