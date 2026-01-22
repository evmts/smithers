import { describe, expect, it, mock } from 'bun:test'
import type { OpenCodeProps } from './agents/types/opencode.js'
import type { AgentResult } from './agents/types/execution.js'

describe('OpenCode', () => {
  it('exports OpenCode component and types', async () => {
    const { OpenCode, executeOpenCode } = await import('./OpenCode.js')
    expect(OpenCode).toBeDefined()
    expect(typeof OpenCode).toBe('function')
    expect(executeOpenCode).toBeDefined()
    expect(typeof executeOpenCode).toBe('function')
  })

  it('exports types correctly', async () => {
    const props: OpenCodeProps = {
      children: 'test prompt',
      model: 'opencode/big-pickle',
    }
    expect(props.model).toBe('opencode/big-pickle')
  })

  it('has correct model type definitions', () => {
    const models: OpenCodeProps['model'][] = [
      'opencode/big-pickle',
      'opencode/gpt-5.2-codex',
      'opencode/claude-sonnet-4-5',
      'anthropic/claude-sonnet-4-20250514',
      'openai/gpt-5.2',
      'custom/model',
    ]
    expect(models).toHaveLength(6)
  })

  it('supports all expected props', () => {
    const fullProps: OpenCodeProps = {
      children: 'Analyze this code',
      model: 'opencode/big-pickle',
      agent: 'coder',
      permissionMode: 'auto',
      cwd: '/tmp/test',
      resumeSession: 'session-123',
      systemPrompt: 'You are a helpful assistant',
      toolConfig: { bash: true, write: false },
      maxTurns: 10,
      maxTokens: 4096,
      timeout: 30000,
      hostname: '127.0.0.1',
      port: 4096,
      serverTimeout: 10000,
      onFinished: (_result: AgentResult) => {},
      onError: (_error: Error) => {},
      onProgress: (_message: string) => {},
      onToolCall: (_tool: string, _input: unknown) => {},
      reportingEnabled: true,
    }

    expect(fullProps.model).toBe('opencode/big-pickle')
    expect(fullProps.agent).toBe('coder')
    expect(fullProps.permissionMode).toBe('auto')
    expect(fullProps.toolConfig).toEqual({ bash: true, write: false })
  })
})

describe('OpenCodeAdapter', () => {
  it('exports adapter with correct name', async () => {
    const { OpenCodeAdapter } = await import('../hooks/adapters/opencode.js')
    expect(OpenCodeAdapter.name).toBe('opencode')
    expect(OpenCodeAdapter.getLoggerName()).toBe('OpenCode')
  })

  it('builds correct agent label', async () => {
    const { OpenCodeAdapter } = await import('../hooks/adapters/opencode.js')
    
    const options = { prompt: 'test', model: 'opencode/gpt-5.2' }
    expect(OpenCodeAdapter.getAgentLabel(options)).toBe('opencode/gpt-5.2')

    const defaultOptions = { prompt: 'test' }
    expect(OpenCodeAdapter.getAgentLabel(defaultOptions)).toBe('opencode/big-pickle')
  })

  it('extracts prompt correctly', async () => {
    const { OpenCodeAdapter } = await import('../hooks/adapters/opencode.js')
    
    const result = await OpenCodeAdapter.extractPrompt('Test prompt', { children: null })
    expect(result.prompt).toBe('Test prompt')
    expect(result.mcpConfigPath).toBeUndefined()
  })

  it('builds options correctly', async () => {
    const { OpenCodeAdapter } = await import('../hooks/adapters/opencode.js')
    
    const props: OpenCodeProps = {
      children: 'test',
      model: 'opencode/big-pickle',
      agent: 'planner',
      permissionMode: 'auto',
      maxTurns: 5,
      systemPrompt: 'Be helpful',
    }

    const options = OpenCodeAdapter.buildOptions(props, {
      prompt: 'Test prompt',
      cwd: '/tmp/test',
      mcpConfigPath: undefined,
    })

    expect(options.prompt).toBe('Test prompt')
    expect(options.model).toBe('opencode/big-pickle')
    expect(options.agent).toBe('planner')
    expect(options.permissionMode).toBe('auto')
    expect(options.maxTurns).toBe(5)
    expect(options.systemPrompt).toBe('Be helpful')
    expect(options.cwd).toBe('/tmp/test')
  })
})

describe('useOpenCode', () => {
  it('exports hook', async () => {
    const { useOpenCode } = await import('../hooks/useOpenCode.js')
    expect(useOpenCode).toBeDefined()
    expect(typeof useOpenCode).toBe('function')
  })
})
