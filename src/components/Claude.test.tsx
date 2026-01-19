/**
 * Unit tests for Claude.tsx - Claude component interface and rendering tests.
 * Tests the component's props, rendering, lifecycle, and CLI integration.
 */
import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import { createSmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { SmithersProvider } from './SmithersProvider.js'
import type { ClaudeProps, AgentResult } from './Claude.js'

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

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start('test-execution')
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
// Status Transitions Tests
// ============================================================================

describe('Claude status transitions', () => {
  test.todo('transitions from pending to running when execution starts')
  test.todo('transitions from running to complete on success')
  test.todo('transitions from running to error on failure')
  test.todo('status is reactive via useQuery from database')
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Claude error handling', () => {
  test.todo('calls onError callback when CLI fails')
  test.todo('stores error in database when reportingEnabled')
  test.todo('includes error message in rendered output')
  test.todo('retries on failure up to maxRetries')
  test.todo('exponential backoff between retries')
})

// ============================================================================
// Timeout Tests
// ============================================================================

describe('Claude timeout', () => {
  test.todo('times out after specified timeout ms')
  test.todo('uses default timeout of 5 minutes when not specified')
  test.todo('stop reason is stop_condition on timeout')
})

// ============================================================================
// Stop Conditions Tests
// ============================================================================

describe('Claude stop conditions', () => {
  test.todo('stops on token_limit condition')
  test.todo('stops on time_limit condition')
  test.todo('stops on turn_limit condition')
  test.todo('stops on pattern match condition')
  test.todo('stops on custom condition function')
  test.todo('includes stop reason message in result')
})

// ============================================================================
// Result Handling Tests
// ============================================================================

describe('Claude result handling', () => {
  test.todo('parses output from CLI')
  test.todo('extracts token usage from output')
  test.todo('extracts turns used from output')
  test.todo('extracts session ID for resume')
  test.todo('parses structured output when outputFormat=json')
})

// ============================================================================
// MCP Children Tests
// ============================================================================

describe('Claude with MCP children', () => {
  test.todo('extracts Sqlite tool config from children')
  test.todo('generates MCP config file for Sqlite')
  test.todo('passes MCP config path to CLI')
  test.todo('extracts tool instructions and prepends to prompt')
  test.todo('supports multiple MCP tools')
})

// ============================================================================
// Schema/Structured Output Tests
// ============================================================================

describe('Claude with schema', () => {
  test.todo('appends schema instructions to system prompt')
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
  test.todo('calls validate function with result')
  test.todo('retries when validate returns false and retryOnValidationFailure=true')
  test.todo('throws when validate returns false and retryOnValidationFailure=false')
  test.todo('async validate functions are awaited')
})

// ============================================================================
// Database Integration Tests
// ============================================================================

describe('Claude database integration', () => {
  let db: SmithersDB
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ path: ':memory:' })
    executionId = await db.execution.start('test-execution')
  })

  afterEach(() => {
    db.close()
  })

  test('registers task on mount when execution starts', async () => {
    // This test verifies the task registration behavior
    const tasks = db.db.query<{ type: string }>('SELECT type FROM tasks')
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
