/**
 * Integration test for agent tool system
 */
import { describe, test, expect } from 'bun:test'
import {
  createAgentTool,
  AgentToolRegistry,
  ClaudeAgentExecutor,
  CodexAgentExecutor,
  GeminiAgentExecutor,
  registerDefaultAgents
} from '../../tools/index.js'

describe('Agent Tool System Integration', () => {
  test('should export all agent components correctly', () => {
    expect(createAgentTool).toBeDefined()
    expect(AgentToolRegistry).toBeDefined()
    expect(ClaudeAgentExecutor).toBeDefined()
    expect(CodexAgentExecutor).toBeDefined()
    expect(GeminiAgentExecutor).toBeDefined()
    expect(registerDefaultAgents).toBeDefined()
  })

  test('should create agent tools from all providers', () => {
    const registry = new AgentToolRegistry()
    registerDefaultAgents(registry)

    expect(registry.get('claude')).toBeInstanceOf(ClaudeAgentExecutor)
    expect(registry.get('codex')).toBeInstanceOf(CodexAgentExecutor)
    expect(registry.get('gemini')).toBeInstanceOf(GeminiAgentExecutor)

    const providers = registry.list()
    expect(providers).toContain('claude')
    expect(providers).toContain('codex')
    expect(providers).toContain('gemini')
  })

  test('should create working agent tools for each provider', () => {
    const registry = new AgentToolRegistry()
    registerDefaultAgents(registry)

    const claudeTool = createAgentTool({
      name: 'claude-coder',
      description: 'Claude coding agent',
      config: {
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022'
      }
    }, registry)

    const codexTool = createAgentTool({
      name: 'codex-analyst',
      description: 'Codex analysis agent',
      config: {
        provider: 'codex',
        model: 'claude-3.5-sonnet'
      }
    }, registry)

    const geminiTool = createAgentTool({
      name: 'gemini-writer',
      description: 'Gemini writing agent',
      config: {
        provider: 'gemini',
        model: 'gemini-1.5-flash'
      }
    }, registry)

    expect(claudeTool.name).toBe('claude-coder')
    expect(codexTool.name).toBe('codex-analyst')
    expect(geminiTool.name).toBe('gemini-writer')

    expect(typeof claudeTool.execute).toBe('function')
    expect(typeof codexTool.execute).toBe('function')
    expect(typeof geminiTool.execute).toBe('function')
  })

  test('should provide correct default configurations', () => {
    const claudeExecutor = new ClaudeAgentExecutor()
    const codexExecutor = new CodexAgentExecutor()
    const geminiExecutor = new GeminiAgentExecutor()

    const claudeDefaults = claudeExecutor.getDefaultConfig()
    expect(claudeDefaults.model).toBe('claude-3-5-sonnet-20241022')
    expect(claudeDefaults.maxTokens).toBe(4000)

    const codexDefaults = codexExecutor.getDefaultConfig()
    expect(codexDefaults.model).toBe('claude-3.5-sonnet')
    expect(codexDefaults.temperature).toBe(0.1)

    const geminiDefaults = geminiExecutor.getDefaultConfig()
    expect(geminiDefaults.model).toBe('gemini-1.5-flash')
    expect(geminiDefaults.maxTokens).toBe(8192)
  })

  test('should validate configurations correctly', () => {
    const claudeExecutor = new ClaudeAgentExecutor()

    expect(() => claudeExecutor.validateConfig({
      provider: 'claude',
      model: 'claude-3-sonnet',
      maxTokens: 2000
    })).not.toThrow()

    expect(() => claudeExecutor.validateConfig({
      provider: 'claude',
      model: ''
    })).toThrow('Model is required')

    expect(() => claudeExecutor.validateConfig({
      provider: 'claude',
      model: 'claude-3-sonnet',
      temperature: 1.5
    })).toThrow('temperature must be between 0 and 1')
  })
})