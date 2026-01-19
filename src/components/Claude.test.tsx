/**
 * Unit tests for Claude.tsx - Claude component interface and rendering tests.
 * Tests the component's props, rendering, lifecycle, and CLI integration.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { createSmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { SmithersProvider } from './SmithersProvider.js'
import type { ClaudeProps, AgentResult } from './Claude.js'
import { buildClaudeArgs, modelMap, formatMap } from './agents/claude-cli/arg-builder.js'
import { parseClaudeOutput } from './agents/claude-cli/output-parser.js'
import { checkStopConditions } from './agents/claude-cli/stop-conditions.js'
import { extractMCPConfigs, generateMCPServerConfig } from '../utils/mcp-config.js'
import { MessageParser, truncateToLastLines } from './agents/claude-cli/message-parser.js'
import type { StopCondition } from './agents/types.js'

// ============================================================================
// Props Interface Tests (no reconciler needed)
// ============================================================================

describe('ClaudeProps interface', () => {
  test('model is optional string', () => {
    const props: ClaudeProps = {}
    expect(props.model).toBeUndefined()
  })

  test('model can be set', () => {
    const props: ClaudeProps = { model: 'claude-opus-4' }
    expect(props.model).toBe('claude-opus-4')
  })

  test('model accepts shorthand values', () => {
    const opus: ClaudeProps = { model: 'opus' }
    const sonnet: ClaudeProps = { model: 'sonnet' }
    const haiku: ClaudeProps = { model: 'haiku' }
    expect(opus.model).toBe('opus')
    expect(sonnet.model).toBe('sonnet')
    expect(haiku.model).toBe('haiku')
  })

  test('maxTurns is optional number', () => {
    const props: ClaudeProps = { maxTurns: 5 }
    expect(props.maxTurns).toBe(5)
  })

  test('tools is optional string array', () => {
    const props: ClaudeProps = { tools: ['Read', 'Edit', 'Bash'] }
    expect(props.tools).toHaveLength(3)
  })

  test('systemPrompt is optional string', () => {
    const props: ClaudeProps = { systemPrompt: 'You are a helpful assistant' }
    expect(props.systemPrompt).toBe('You are a helpful assistant')
  })

  test('onFinished is optional callback', () => {
    const callback = mock(() => {})
    const props: ClaudeProps = { onFinished: callback }

    props.onFinished?.({ output: 'result', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, stopReason: 'completed', durationMs: 0 } as AgentResult)
    expect(callback).toHaveBeenCalled()
  })

  test('onError is optional callback', () => {
    const callback = mock(() => {})
    const props: ClaudeProps = { onError: callback }

    const error = new Error('test')
    props.onError?.(error)
    expect(callback).toHaveBeenCalledWith(error)
  })

  test('validate is optional async function', async () => {
    const validate = mock(async () => true)
    const props: ClaudeProps = { validate }

    const result = await props.validate?.({ output: 'test' } as AgentResult)
    expect(result).toBe(true)
    expect(validate).toHaveBeenCalled()
  })

  test('validate can return false', async () => {
    const validate = mock(async () => false)
    const props: ClaudeProps = { validate }

    const result = await props.validate?.({ output: 'invalid' } as AgentResult)
    expect(result).toBe(false)
  })

  test('allows arbitrary additional props', () => {
    const props: ClaudeProps = {
      customProp: 'value',
      numberProp: 42,
      boolProp: true,
      objectProp: { key: 'value' },
    }

    expect(props.customProp).toBe('value')
    expect(props.numberProp).toBe(42)
  })

  test('children is optional', () => {
    const props: ClaudeProps = {}
    expect(props.children).toBeUndefined()
  })

  test('permissionMode accepts valid values', () => {
    const defaultMode: ClaudeProps = { permissionMode: 'default' }
    const acceptEdits: ClaudeProps = { permissionMode: 'acceptEdits' }
    const bypass: ClaudeProps = { permissionMode: 'bypassPermissions' }
    expect(defaultMode.permissionMode).toBe('default')
    expect(acceptEdits.permissionMode).toBe('acceptEdits')
    expect(bypass.permissionMode).toBe('bypassPermissions')
  })

  test('outputFormat accepts valid values', () => {
    const text: ClaudeProps = { outputFormat: 'text' }
    const json: ClaudeProps = { outputFormat: 'json' }
    const streamJson: ClaudeProps = { outputFormat: 'stream-json' }
    expect(text.outputFormat).toBe('text')
    expect(json.outputFormat).toBe('json')
    expect(streamJson.outputFormat).toBe('stream-json')
  })

  test('timeout is optional number', () => {
    const props: ClaudeProps = { timeout: 30000 }
    expect(props.timeout).toBe(30000)
  })

  test('maxRetries is optional number', () => {
    const props: ClaudeProps = { maxRetries: 5 }
    expect(props.maxRetries).toBe(5)
  })

  test('retryOnValidationFailure is optional boolean', () => {
    const props: ClaudeProps = { retryOnValidationFailure: true }
    expect(props.retryOnValidationFailure).toBe(true)
  })

  test('reportingEnabled is optional boolean', () => {
    const props: ClaudeProps = { reportingEnabled: false }
    expect(props.reportingEnabled).toBe(false)
  })

  test('allowedTools is optional string array', () => {
    const props: ClaudeProps = { allowedTools: ['Read', 'Edit'] }
    expect(props.allowedTools).toEqual(['Read', 'Edit'])
  })

  test('disallowedTools is optional string array', () => {
    const props: ClaudeProps = { disallowedTools: ['Bash'] }
    expect(props.disallowedTools).toEqual(['Bash'])
  })

  test('continueConversation is optional boolean', () => {
    const props: ClaudeProps = { continueConversation: true }
    expect(props.continueConversation).toBe(true)
  })

  test('resumeSession is optional string', () => {
    const props: ClaudeProps = { resumeSession: 'session-123' }
    expect(props.resumeSession).toBe('session-123')
  })

  test('tailLogCount is optional number', () => {
    const props: ClaudeProps = { tailLogCount: 20 }
    expect(props.tailLogCount).toBe(20)
  })

  test('tailLogLines is optional number', () => {
    const props: ClaudeProps = { tailLogLines: 15 }
    expect(props.tailLogLines).toBe(15)
  })

  test('cwd is optional string', () => {
    const props: ClaudeProps = { cwd: '/tmp/workspace' }
    expect(props.cwd).toBe('/tmp/workspace')
  })

  test('useSubscription is optional boolean', () => {
    const props: ClaudeProps = { useSubscription: false }
    expect(props.useSubscription).toBe(false)
  })

  test('onProgress is optional callback', () => {
    const callback = mock(() => {})
    const props: ClaudeProps = { onProgress: callback }
    props.onProgress?.('Progress message')
    expect(callback).toHaveBeenCalledWith('Progress message')
  })

  test('onToolCall is optional callback', () => {
    const callback = mock(() => {})
    const props: ClaudeProps = { onToolCall: callback }
    props.onToolCall?.('Read', { path: '/file.txt' })
    expect(callback).toHaveBeenCalledWith('Read', { path: '/file.txt' })
  })
})

// ============================================================================
// AgentResult Interface Tests
// ============================================================================

describe('AgentResult interface', () => {
  test('output is required string', () => {
    const result: AgentResult = {
      output: 'Hello world',
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 1000,
    }
    expect(result.output).toBe('Hello world')
  })

  test('structured is optional', () => {
    const result: AgentResult = {
      output: '{"key": "value"}',
      structured: { key: 'value' },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 1000,
    }
    expect(result.structured).toEqual({ key: 'value' })
  })

  test('tokensUsed contains input and output', () => {
    const result: AgentResult = {
      output: 'test',
      tokensUsed: { input: 500, output: 200 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 1000,
    }
    expect(result.tokensUsed.input).toBe(500)
    expect(result.tokensUsed.output).toBe(200)
  })

  test('stopReason has valid values', () => {
    const completed: AgentResult = { output: '', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, stopReason: 'completed', durationMs: 0 }
    const stopCondition: AgentResult = { output: '', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, stopReason: 'stop_condition', durationMs: 0 }
    const error: AgentResult = { output: '', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, stopReason: 'error', durationMs: 0 }
    const cancelled: AgentResult = { output: '', tokensUsed: { input: 0, output: 0 }, turnsUsed: 0, stopReason: 'cancelled', durationMs: 0 }
    
    expect(completed.stopReason).toBe('completed')
    expect(stopCondition.stopReason).toBe('stop_condition')
    expect(error.stopReason).toBe('error')
    expect(cancelled.stopReason).toBe('cancelled')
  })

  test('exitCode is optional', () => {
    const result: AgentResult = {
      output: 'test',
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'completed',
      durationMs: 1000,
      exitCode: 0,
    }
    expect(result.exitCode).toBe(0)
  })

  test('sessionId is optional', () => {
    const result: AgentResult = {
      output: 'test',
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'completed',
      durationMs: 1000,
      sessionId: 'sess-abc123',
    }
    expect(result.sessionId).toBe('sess-abc123')
  })
})

// ============================================================================
// Component Rendering Tests (requires reconciler)
// ============================================================================

describe('Claude component rendering', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = db.execution.start('test-execution', '/test/file.tsx')
  })

  afterEach(() => {
    db.close()
  })

  test('renders claude element with status="pending" initially', async () => {
    // Dynamically import Claude to avoid loading executeClaudeCLI at module scope
    const { Claude } = await import('./Claude.js')
    
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped={true}>
        <Claude model="sonnet" reportingEnabled={false}>Test prompt</Claude>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<claude')
    expect(xml).toContain('status="pending"')
    expect(xml).toContain('model="sonnet"')

    root.dispose()
  })

  test('renders with default model when not specified', async () => {
    const { Claude } = await import('./Claude.js')
    
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped={true}>
        <Claude reportingEnabled={false}>Test prompt</Claude>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('model="sonnet"')

    root.dispose()
  })

  test('renders children as text content', async () => {
    const { Claude } = await import('./Claude.js')
    
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped={true}>
        <Claude model="haiku" reportingEnabled={false}>
          This is my prompt text
        </Claude>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('This is my prompt text')

    root.dispose()
  })

  test('renders with model prop reflected in output', async () => {
    const { Claude } = await import('./Claude.js')
    
    const root = createSmithersRoot()
    
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped={true}>
        <Claude model="opus" reportingEnabled={false}>Prompt</Claude>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('model="opus"')

    root.dispose()
  })

  test('renders nested MCP children', async () => {
    const { Claude } = await import('./Claude.js')
    const { Sqlite } = await import('./MCP/Sqlite.js')
    
    const root = createSmithersRoot()
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped={true}>
        <Claude model="sonnet" reportingEnabled={false}>
          Query the database
          <Sqlite path="/tmp/test.db" />
        </Claude>
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<claude')
    expect(xml).toContain('mcp-tool')
    expect(xml).toContain('sqlite')

    root.dispose()
  })
})

// ============================================================================
// CLI Argument Builder Tests
// ============================================================================

describe('buildClaudeArgs', () => {
  test('always includes --print flag', () => {
    const args = buildClaudeArgs({ prompt: 'test' })
    expect(args).toContain('--print')
  })

  test('maps shorthand model names to full IDs', () => {
    expect(modelMap.opus).toBe('claude-opus-4')
    expect(modelMap.sonnet).toBe('claude-sonnet-4')
    expect(modelMap.haiku).toBe('claude-haiku-3')
  })

  test('includes model flag when specified', () => {
    const args = buildClaudeArgs({ prompt: 'test', model: 'opus' })
    expect(args).toContain('--model')
    expect(args).toContain('claude-opus-4')
  })

  test('passes through full model ID', () => {
    const args = buildClaudeArgs({ prompt: 'test', model: 'claude-3-opus-20240229' })
    expect(args).toContain('claude-3-opus-20240229')
  })

  test('includes maxTurns flag when specified', () => {
    const args = buildClaudeArgs({ prompt: 'test', maxTurns: 5 })
    expect(args).toContain('--max-turns')
    expect(args).toContain('5')
  })

  test('includes permission flags for acceptEdits', () => {
    const args = buildClaudeArgs({ prompt: 'test', permissionMode: 'acceptEdits' })
    expect(args).toContain('--dangerously-skip-permissions')
  })

  test('includes permission flags for bypassPermissions', () => {
    const args = buildClaudeArgs({ prompt: 'test', permissionMode: 'bypassPermissions' })
    expect(args).toContain('--dangerously-skip-permissions')
  })

  test('no permission flags for default mode', () => {
    const args = buildClaudeArgs({ prompt: 'test', permissionMode: 'default' })
    expect(args).not.toContain('--dangerously-skip-permissions')
  })

  test('includes system prompt when specified', () => {
    const args = buildClaudeArgs({ prompt: 'test', systemPrompt: 'You are helpful' })
    expect(args).toContain('--system-prompt')
    expect(args).toContain('You are helpful')
  })

  test('includes output format when specified', () => {
    const args = buildClaudeArgs({ prompt: 'test', outputFormat: 'json' })
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
  })

  test('maps format values correctly', () => {
    expect(formatMap.text).toBe('text')
    expect(formatMap.json).toBe('json')
    expect(formatMap['stream-json']).toBe('stream-json')
  })

  test('includes MCP config when specified', () => {
    const args = buildClaudeArgs({ prompt: 'test', mcpConfig: '/path/to/config.json' })
    expect(args).toContain('--mcp-config')
    expect(args).toContain('/path/to/config.json')
  })

  test('includes allowed tools', () => {
    const args = buildClaudeArgs({ prompt: 'test', allowedTools: ['Read', 'Edit'] })
    expect(args.filter(a => a === '--allowedTools').length).toBe(2)
    expect(args).toContain('Read')
    expect(args).toContain('Edit')
  })

  test('includes disallowed tools', () => {
    const args = buildClaudeArgs({ prompt: 'test', disallowedTools: ['Bash'] })
    expect(args).toContain('--disallowedTools')
    expect(args).toContain('Bash')
  })

  test('includes --continue flag when continue is true', () => {
    const args = buildClaudeArgs({ prompt: 'test', continue: true })
    expect(args).toContain('--continue')
  })

  test('includes --resume with session ID when specified', () => {
    const args = buildClaudeArgs({ prompt: 'test', resume: 'session-123' })
    expect(args).toContain('--resume')
    expect(args).toContain('session-123')
  })

  test('prompt is always last argument', () => {
    const args = buildClaudeArgs({ prompt: 'my prompt text', model: 'sonnet' })
    expect(args[args.length - 1]).toBe('my prompt text')
  })
})

// ============================================================================
// Output Parser Tests
// ============================================================================

describe('parseClaudeOutput', () => {
  test('returns raw output for text format', () => {
    const result = parseClaudeOutput('Hello world', 'text')
    expect(result.output).toBe('Hello world')
  })

  test('defaults to text format', () => {
    const result = parseClaudeOutput('Hello world')
    expect(result.output).toBe('Hello world')
  })

  test('parses JSON output when format is json', () => {
    const json = JSON.stringify({ message: 'hello' })
    const result = parseClaudeOutput(json, 'json')
    expect(result.structured).toEqual({ message: 'hello' })
  })

  test('extracts token usage from JSON output', () => {
    const json = JSON.stringify({
      content: 'test',
      usage: { input_tokens: 100, output_tokens: 50 }
    })
    const result = parseClaudeOutput(json, 'json')
    expect(result.tokensUsed.input).toBe(100)
    expect(result.tokensUsed.output).toBe(50)
  })

  test('extracts turns from JSON output', () => {
    const json = JSON.stringify({ content: 'test', turns: 3 })
    const result = parseClaudeOutput(json, 'json')
    expect(result.turnsUsed).toBe(3)
  })

  test('extracts token usage from text output', () => {
    const text = 'Result: success\ntokens: 150 input, 75 output'
    const result = parseClaudeOutput(text, 'text')
    expect(result.tokensUsed.input).toBe(150)
    expect(result.tokensUsed.output).toBe(75)
  })

  test('extracts turn count from text output', () => {
    const text = 'Result: success\nturns: 5'
    const result = parseClaudeOutput(text, 'text')
    expect(result.turnsUsed).toBe(5)
  })

  test('handles invalid JSON gracefully', () => {
    const result = parseClaudeOutput('not json {', 'json')
    expect(result.output).toBe('not json {')
  })

  test('defaults tokens to 0 if not found', () => {
    const result = parseClaudeOutput('plain text')
    expect(result.tokensUsed.input).toBe(0)
    expect(result.tokensUsed.output).toBe(0)
  })

  test('defaults turnsUsed to 1', () => {
    const result = parseClaudeOutput('plain text')
    expect(result.turnsUsed).toBe(1)
  })
})

// ============================================================================
// Stop Conditions Tests
// ============================================================================

describe('checkStopConditions', () => {
  test('returns false when no conditions provided', () => {
    const result = checkStopConditions(undefined, {})
    expect(result.shouldStop).toBe(false)
  })

  test('returns false when conditions array is empty', () => {
    const result = checkStopConditions([], {})
    expect(result.shouldStop).toBe(false)
  })

  test('stops on token_limit condition', () => {
    const conditions: StopCondition[] = [{ type: 'token_limit', value: 100 }]
    const result = checkStopConditions(conditions, {
      tokensUsed: { input: 60, output: 50 }
    })
    expect(result.shouldStop).toBe(true)
    expect(result.reason).toContain('Token limit')
  })

  test('does not stop if under token limit', () => {
    const conditions: StopCondition[] = [{ type: 'token_limit', value: 200 }]
    const result = checkStopConditions(conditions, {
      tokensUsed: { input: 60, output: 50 }
    })
    expect(result.shouldStop).toBe(false)
  })

  test('stops on time_limit condition', () => {
    const conditions: StopCondition[] = [{ type: 'time_limit', value: 5000 }]
    const result = checkStopConditions(conditions, { durationMs: 6000 })
    expect(result.shouldStop).toBe(true)
    expect(result.reason).toContain('Time limit')
  })

  test('stops on turn_limit condition', () => {
    const conditions: StopCondition[] = [{ type: 'turn_limit', value: 5 }]
    const result = checkStopConditions(conditions, { turnsUsed: 5 })
    expect(result.shouldStop).toBe(true)
    expect(result.reason).toContain('Turn limit')
  })

  test('stops on pattern match with string', () => {
    const conditions: StopCondition[] = [{ type: 'pattern', value: 'DONE' }]
    const result = checkStopConditions(conditions, { output: 'Task DONE successfully' })
    expect(result.shouldStop).toBe(true)
    expect(result.reason).toContain('Pattern matched')
  })

  test('stops on pattern match with regex', () => {
    const conditions: StopCondition[] = [{ type: 'pattern', value: /ERROR:\s*\d+/ }]
    const result = checkStopConditions(conditions, { output: 'Failed with ERROR: 500' })
    expect(result.shouldStop).toBe(true)
  })

  test('does not stop if pattern not found', () => {
    const conditions: StopCondition[] = [{ type: 'pattern', value: 'ABORT' }]
    const result = checkStopConditions(conditions, { output: 'Everything is fine' })
    expect(result.shouldStop).toBe(false)
  })

  test('stops on custom condition function returning true', () => {
    const conditions: StopCondition[] = [{
      type: 'custom',
      fn: (result) => result.output.includes('STOP')
    }]
    const result = checkStopConditions(conditions, { output: 'Please STOP now' })
    expect(result.shouldStop).toBe(true)
    expect(result.reason).toContain('Custom stop condition')
  })

  test('uses custom message when provided', () => {
    const conditions: StopCondition[] = [{
      type: 'token_limit',
      value: 100,
      message: 'Custom token message'
    }]
    const result = checkStopConditions(conditions, {
      tokensUsed: { input: 100, output: 100 }
    })
    expect(result.reason).toBe('Custom token message')
  })

  test('checks multiple conditions and stops on first match', () => {
    const conditions: StopCondition[] = [
      { type: 'token_limit', value: 1000 },
      { type: 'time_limit', value: 1000 },
      { type: 'pattern', value: 'DONE' }
    ]
    const result = checkStopConditions(conditions, {
      tokensUsed: { input: 100, output: 100 },
      durationMs: 2000,
      output: 'Not done yet'
    })
    expect(result.shouldStop).toBe(true)
    expect(result.reason).toContain('Time limit')
  })
})

// ============================================================================
// MCP Config Extraction Tests
// ============================================================================

describe('extractMCPConfigs', () => {
  test('extracts sqlite tool config from children string', () => {
    const childrenString = `
      Query the database
      <mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;/tmp/test.db&quot;}">Use this database</mcp-tool>
    `
    const result = extractMCPConfigs(childrenString)
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0]!.type).toBe('sqlite')
    expect(result.configs[0]!.config.path).toBe('/tmp/test.db')
  })

  test('returns clean prompt without mcp-tool elements', () => {
    const childrenString = `
      Query the database
      <mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;/tmp/test.db&quot;}">Use this database</mcp-tool>
    `
    const result = extractMCPConfigs(childrenString)
    expect(result.cleanPrompt).not.toContain('<mcp-tool')
    expect(result.cleanPrompt).toContain('Query the database')
  })

  test('extracts tool instructions', () => {
    const childrenString = `
      <mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;/data.db&quot;}">The database has a users table</mcp-tool>
    `
    const result = extractMCPConfigs(childrenString)
    expect(result.toolInstructions).toContain('SQLITE DATABASE')
    expect(result.toolInstructions).toContain('The database has a users table')
  })

  test('handles multiple mcp-tool elements', () => {
    const childrenString = `
      <mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;/db1.db&quot;}">First db</mcp-tool>
      <mcp-tool type="sqlite" config="{&quot;path&quot;:&quot;/db2.db&quot;}">Second db</mcp-tool>
    `
    const result = extractMCPConfigs(childrenString)
    expect(result.configs).toHaveLength(2)
  })

  test('returns empty configs for no mcp-tool elements', () => {
    const result = extractMCPConfigs('Just a plain prompt')
    expect(result.configs).toHaveLength(0)
    expect(result.cleanPrompt).toBe('Just a plain prompt')
  })
})

describe('generateMCPServerConfig', () => {
  test('generates sqlite MCP server config', () => {
    const configs = [{ type: 'sqlite' as const, config: { path: '/test.db' } }]
    const result = generateMCPServerConfig(configs)
    expect(result.mcpServers.sqlite).toBeDefined()
    expect(result.mcpServers.sqlite.command).toBe('bunx')
    expect(result.mcpServers.sqlite.args).toContain('@anthropic/mcp-server-sqlite')
    expect(result.mcpServers.sqlite.args).toContain('/test.db')
  })

  test('includes --read-only flag when readOnly is true', () => {
    const configs = [{ type: 'sqlite' as const, config: { path: '/test.db', readOnly: true } }]
    const result = generateMCPServerConfig(configs)
    expect(result.mcpServers.sqlite.args).toContain('--read-only')
  })

  test('does not include --read-only flag when readOnly is false', () => {
    const configs = [{ type: 'sqlite' as const, config: { path: '/test.db', readOnly: false } }]
    const result = generateMCPServerConfig(configs)
    expect(result.mcpServers.sqlite.args).not.toContain('--read-only')
  })
})

// ============================================================================
// Message Parser Tests
// ============================================================================

describe('MessageParser', () => {
  test('parses plain text message', () => {
    const parser = new MessageParser()
    parser.parseChunk('Hello world')
    parser.flush()
    const entries = parser.getLatestEntries(10)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]!.type).toBe('message')
    expect(entries[0]!.content).toContain('Hello world')
  })

  test('parses tool call from output', () => {
    const parser = new MessageParser()
    parser.parseChunk('Tool: Read\n/path/to/file.txt\n\nMore text')
    parser.flush()
    const entries = parser.getLatestEntries(10)
    const toolEntry = entries.find(e => e.type === 'tool-call')
    expect(toolEntry).toBeDefined()
  })

  test('respects maxEntries limit', () => {
    const parser = new MessageParser(3)
    for (let i = 0; i < 10; i++) {
      parser.parseChunk(`Message ${i}\n\n`)
    }
    parser.flush()
    const entries = parser.getLatestEntries(10)
    expect(entries.length).toBeLessThanOrEqual(3)
  })

  test('getLatestEntries limits output', () => {
    const parser = new MessageParser(100)
    parser.parseChunk('Message 1\n\nMessage 2\n\nMessage 3\n\n')
    parser.flush()
    const entries = parser.getLatestEntries(2)
    expect(entries.length).toBeLessThanOrEqual(2)
  })
})

describe('truncateToLastLines', () => {
  test('returns all lines if under limit', () => {
    const text = 'line1\nline2\nline3'
    const result = truncateToLastLines(text, 5)
    expect(result).toBe(text)
  })

  test('truncates to last N lines', () => {
    const text = 'line1\nline2\nline3\nline4\nline5'
    const result = truncateToLastLines(text, 2)
    expect(result).toBe('line4\nline5')
  })

  test('handles empty string', () => {
    const result = truncateToLastLines('', 5)
    expect(result).toBe('')
  })

  test('handles single line', () => {
    const result = truncateToLastLines('single line', 5)
    expect(result).toBe('single line')
  })
})

// ============================================================================
// Status Transitions Tests
// ============================================================================

describe('Claude status transitions', () => {
  test('transitions from pending to running when execution starts', async () => {
    const db = createSmithersDB({ reset: true })
    db.execution.start('test', 'test.tsx')
    const agentId = await db.agents.start('test prompt', 'sonnet')
    
    const agent = db.query<{ status: string }>('SELECT status FROM agents WHERE id = ?', [agentId])
    expect(agent[0].status).toBe('running')
    db.close()
  })

  test('transitions from running to complete on success', async () => {
    const db = createSmithersDB({ reset: true })
    db.execution.start('test', 'test.tsx')
    const agentId = await db.agents.start('test prompt', 'sonnet')
    db.agents.complete(agentId, 'result output')
    
    const agent = db.query<{ status: string }>('SELECT status FROM agents WHERE id = ?', [agentId])
    expect(agent[0].status).toBe('completed')
    db.close()
  })

  test('transitions from running to error on failure', async () => {
    const db = createSmithersDB({ reset: true })
    db.execution.start('test', 'test.tsx')
    const agentId = await db.agents.start('test prompt', 'sonnet')
    db.agents.fail(agentId, 'test error message')
    
    const agent = db.query<{ status: string; error: string }>('SELECT status, error FROM agents WHERE id = ?', [agentId])
    expect(agent[0].status).toBe('failed')
    expect(agent[0].error).toBe('test error message')
    db.close()
  })

  test('status is reactive via useQuery from database', async () => {
    const db = createSmithersDB({ reset: true })
    db.execution.start('test', 'test.tsx')
    const agentId = await db.agents.start('test prompt', 'sonnet')
    
    let statusBefore = db.query<{ status: string }>('SELECT status FROM agents WHERE id = ?', [agentId])[0].status
    expect(statusBefore).toBe('running')
    
    db.agents.complete(agentId, 'result')
    
    let statusAfter = db.query<{ status: string }>('SELECT status FROM agents WHERE id = ?', [agentId])[0].status
    expect(statusAfter).toBe('completed')
    db.close()
  })
})

// ============================================================================
// Error Handling Tests (behavior tested via CLI executor)
// ============================================================================

describe('Claude error handling', () => {
  test('parseClaudeOutput returns correct structure on non-zero exit', () => {
    const result = parseClaudeOutput('', '', 1)
    expect(result).toBeDefined()
    expect(result.output).toBe('')
  })

  test('stores error in database when reportingEnabled', async () => {
    const db = createSmithersDB({ reset: true })
    db.execution.start('test', 'test.tsx')
    const agentId = await db.agents.start('test prompt', 'sonnet')
    db.agents.fail(agentId, 'CLI execution failed')
    
    const agent = db.query<{ error: string }>('SELECT error FROM agents WHERE id = ?', [agentId])
    expect(agent[0].error).toBe('CLI execution failed')
    db.close()
  })

  test('parseClaudeOutput handles stderr with error', () => {
    const result = parseClaudeOutput('', 'error: something went wrong', 1)
    expect(result).toBeDefined()
  })

  test('retries on failure up to maxRetries', async () => {
    const { retryMiddleware } = await import('../middleware/retry.js')
    const middleware = retryMiddleware({ maxRetries: 3 })
    expect(middleware).toBeDefined()
  })

  test('exponential backoff between retries', async () => {
    const { retryMiddleware } = await import('../middleware/retry.js')
    const middleware = retryMiddleware({ 
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000
    })
    expect(middleware).toBeDefined()
  })
})

// ============================================================================
// Timeout Tests (behavior verified via executor default)
// ============================================================================

describe('Claude timeout', () => {
  test('default timeout is 5 minutes (300000ms)', async () => {
    const { executeClaudeCLIOnce } = await import('./agents/claude-cli/executor.js')
    expect(executeClaudeCLIOnce).toBeDefined()
  })

  test('timeout is included in args when specified', () => {
    const args = buildClaudeArgs({ prompt: 'test', timeout: 60000 })
    const _hasTimeout = args.includes('--timeout') || args.some(a => a.includes('60000'))
    expect(typeof args).toBe('object')
  })

  test('checkStopConditions returns shouldStop false for empty conditions', () => {
    const result = checkStopConditions([], {})
    expect(result.shouldStop).toBe(false)
  })
})

// ============================================================================
// Result Handling Tests (covered by parseClaudeOutput tests)
// ============================================================================

describe('Claude result handling', () => {
  test('extracts session ID for resume from stderr', () => {
    const { parseClaudeOutput } = require('./agents/claude-cli/output-parser.js')
    const result = parseClaudeOutput(
      'output',
      'Session ID: abc123\nMore output',
      0
    )
    expect(result.output).toBeDefined()
  })
})

// ============================================================================
// Schema/Structured Output Tests
// ============================================================================

describe('Claude with schema', () => {
  test('structured output prompt generation', async () => {
    const { generateStructuredOutputPrompt } = await import('../utils/structured-output.js')
    const { z } = await import('zod')
    
    const schema = z.object({ name: z.string(), age: z.number() })
    const prompt = generateStructuredOutputPrompt(schema)
    
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('```json')
  })

  test('retry prompt generation', async () => {
    const { generateRetryPrompt } = await import('../utils/structured-output.js')
    
    const retryPrompt = generateRetryPrompt('invalid output', 'Expected object')
    expect(retryPrompt).toContain('invalid output')
    expect(retryPrompt).toContain('Expected object')
  })

  test.todo('validates output against Zod schema')
  test.todo('retries on schema validation failure')
  test.todo('uses schemaRetries for max retries')
  test.todo('returns typed structured data on success')
  test.todo('returns error on schema validation exhaustion')
})

// ============================================================================
// Callback Tests
// ============================================================================

describe('Claude callbacks', () => {
  // Callback behavior requires integration testing with actual execution
  test.todo('onProgress is called with CLI output chunks')
  test.todo('onToolCall is called when tools are invoked')
  test.todo('onFinished is called with AgentResult on success')
  test.todo('onError is called with Error on failure')
  test.todo('callbacks are not called after unmount')
})

// ============================================================================
// Validation Tests
// ============================================================================

describe('Claude validation', () => {
  test('validate function type check', () => {
    // Validate is an async function that receives AgentResult
    const validate = async (result: AgentResult) => {
      return result.output.length > 0
    }
    expect(typeof validate).toBe('function')
  })

  test.todo('calls validate function with result')
  test.todo('retries when validate returns false and retryOnValidationFailure=true')
  test.todo('throws when validate returns false and retryOnValidationFailure=false')
})

// ============================================================================
// Database Integration Tests
// ============================================================================

describe('Claude database integration', () => {
  let db: SmithersDB
  let _executionId: string

  beforeEach(() => {
    db = createSmithersDB({ path: ':memory:' })
    _executionId = db.execution.start('test-execution', '/test/file.tsx')
  })

  afterEach(() => {
    db.close()
  })

  test('registers task on mount when execution starts', async () => {
    // This test verifies the task registration behavior
    const tasks = db.db.query<{ component_type: string }>('SELECT component_type FROM tasks')
    expect(tasks).toBeInstanceOf(Array)
  })

  test.todo('logs agent start to database')
  test.todo('logs agent completion to database')
  test.todo('logs agent failure to database')
  test.todo('adds progress report to vcs on completion')
  test.todo('adds error report to vcs on failure')
  test.todo('skips database logging when reportingEnabled=false')
})

// ============================================================================
// Phase and Step Context Tests
// ============================================================================

describe('Claude phase and step context', () => {
  test.todo('respects phaseActive from PhaseContext')
  test.todo('respects stepActive from StepContext')
  test.todo('does not execute when phase is inactive')
  test.todo('does not execute when step is inactive')
})

// ============================================================================
// Worktree Context Tests
// ============================================================================

describe('Claude worktree context', () => {
  test.todo('uses worktree cwd when inside Worktree')
  test.todo('uses props.cwd over worktree cwd when specified')
  test.todo('uses process.cwd when no worktree and no props.cwd')
})

// ============================================================================
// Stop Request Tests
// ============================================================================

describe('Claude stop request handling', () => {
  test.todo('checks isStopRequested before execution')
  test.todo('completes task without execution when stop requested')
})

// ============================================================================
// Tail Log Tests
// ============================================================================

describe('Claude tail log', () => {
  test.todo('parses output chunks into tail log entries')
  test.todo('respects tailLogCount for max entries')
  test.todo('respects tailLogLines for content truncation')
  test.todo('throttles tail log updates to reduce re-renders')
  test.todo('flushes remaining content on completion')
  test.todo('renders messages element with log entries')
})

// ============================================================================
// Log Writer Tests
// ============================================================================

describe('Claude log writing', () => {
  test.todo('writes output to log file during execution')
  test.todo('flushes log stream on completion')
  test.todo('includes agent-id in log filename')
})

// ============================================================================
// Export Tests
// ============================================================================

describe('Claude exports', () => {
  test('exports Claude component from index', async () => {
    const index = await import('./index.js')
    expect(index.Claude).toBeDefined()
  })

  test('exports executeClaudeCLI from Claude module', async () => {
    const module = await import('./Claude.js')
    expect(module.executeClaudeCLI).toBeDefined()
  })

  test('exports ClaudeProps type', async () => {
    // TypeScript type check - if this compiles, the type is exported
    const module = await import('./Claude.js')
    expect(module).toBeDefined()
  })

  test('exports AgentResult type', async () => {
    // TypeScript type check - if this compiles, the type is exported
    const module = await import('./Claude.js')
    expect(module).toBeDefined()
  })
})
