/**
 * Tests for agent tool system types
 */
import { describe, test, expect } from 'bun:test'
import type {
  AgentProvider,
  AgentToolConfig,
  AgentInvocation,
  AgentToolResult,
  CreateAgentToolOptions
} from './types.js'

describe('AgentProvider', () => {
  test('should define valid provider types', () => {
    const providers: AgentProvider[] = ['claude', 'gemini', 'codex']
    expect(providers).toHaveLength(3)
    expect(providers).toContain('claude')
    expect(providers).toContain('gemini')
    expect(providers).toContain('codex')
  })
})

describe('AgentToolConfig', () => {
  test('should accept basic configuration', () => {
    const config: AgentToolConfig = {
      provider: 'claude',
      model: 'sonnet',
      maxTokens: 4000
    }

    expect(config.provider).toBe('claude')
    expect(config.model).toBe('sonnet')
    expect(config.maxTokens).toBe(4000)
  })

  test('should accept optional system prompt', () => {
    const config: AgentToolConfig = {
      provider: 'gemini',
      model: 'gemini-pro',
      systemPrompt: 'You are a helpful assistant.'
    }

    expect(config.systemPrompt).toBe('You are a helpful assistant.')
  })

  test('should accept timeout configuration', () => {
    const config: AgentToolConfig = {
      provider: 'codex',
      model: 'claude-3.5-sonnet',
      timeout: 30000
    }

    expect(config.timeout).toBe(30000)
  })

  test('should accept tools configuration', () => {
    const config: AgentToolConfig = {
      provider: 'claude',
      model: 'opus',
      tools: ['bash', 'file_read']
    }

    expect(config.tools).toEqual(['bash', 'file_read'])
  })
})

describe('AgentInvocation', () => {
  test('should define required properties', () => {
    const invocation: AgentInvocation = {
      prompt: 'Generate a Python script to calculate fibonacci numbers',
      config: {
        provider: 'claude',
        model: 'sonnet'
      }
    }

    expect(invocation.prompt).toBe('Generate a Python script to calculate fibonacci numbers')
    expect(invocation.config.provider).toBe('claude')
  })

  test('should accept optional context', () => {
    const invocation: AgentInvocation = {
      prompt: 'Fix the bug in this code',
      config: {
        provider: 'gemini',
        model: 'gemini-pro'
      },
      context: {
        codeFile: 'main.py',
        errorMessage: 'TypeError: unsupported operand type(s)'
      }
    }

    expect(invocation.context).toEqual({
      codeFile: 'main.py',
      errorMessage: 'TypeError: unsupported operand type(s)'
    })
  })
})

describe('AgentToolResult', () => {
  test('should define success result structure', () => {
    const result: AgentToolResult = {
      success: true,
      content: 'Generated code successfully',
      usage: {
        inputTokens: 150,
        outputTokens: 300,
        totalTokens: 450
      }
    }

    expect(result.success).toBe(true)
    expect(result.content).toBe('Generated code successfully')
    expect(result.usage?.totalTokens).toBe(450)
  })

  test('should define error result structure', () => {
    const result: AgentToolResult = {
      success: false,
      error: 'Model timeout exceeded',
      usage: {
        inputTokens: 100,
        outputTokens: 0,
        totalTokens: 100
      }
    }

    expect(result.success).toBe(false)
    expect(result.error).toBe('Model timeout exceeded')
  })

  test('should accept execution metadata', () => {
    const result: AgentToolResult = {
      success: true,
      content: 'Task completed',
      executionTime: 5000,
      turns: 3,
      stopReason: 'max_turns'
    }

    expect(result.executionTime).toBe(5000)
    expect(result.turns).toBe(3)
    expect(result.stopReason).toBe('max_turns')
  })
})

describe('CreateAgentToolOptions', () => {
  test('should define tool creation options', () => {
    const options: CreateAgentToolOptions = {
      name: 'claude-coder',
      description: 'Claude agent specialized for code generation',
      config: {
        provider: 'claude',
        model: 'sonnet',
        systemPrompt: 'You are an expert programmer.',
        tools: ['bash', 'file_write']
      }
    }

    expect(options.name).toBe('claude-coder')
    expect(options.description).toContain('Claude agent')
    expect(options.config.provider).toBe('claude')
  })

  test('should accept input/output schemas', () => {
    const options: CreateAgentToolOptions = {
      name: 'gemini-analyzer',
      description: 'Gemini agent for code analysis',
      config: {
        provider: 'gemini',
        model: 'gemini-pro'
      },
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          language: { type: 'string' }
        },
        required: ['code']
      },
      outputSchema: {
        type: 'object',
        properties: {
          issues: { type: 'array' },
          suggestions: { type: 'array' }
        }
      }
    }

    expect(options.inputSchema?.properties).toHaveProperty('code')
    expect(options.outputSchema?.properties).toHaveProperty('issues')
  })
})