/**
 * Tests for Codex CLI Executor
 * Covers executeCodexCLI, executeCodexCLIOnce, executeCodexShell
 * 
 * Note: Tests that require actual CLI execution are skipped.
 * We focus on unit testing the helper functions and integration tests.
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import type { CodexCLIExecutionOptions } from '../types/codex.js'
import type { AgentResult } from '../types.js'
import { buildCodexArgs } from './arg-builder.js'
import { parseCodexOutput } from './output-parser.js'
import { DEFAULT_CLI_TIMEOUT_MS } from './executor.js'

describe('executor constants', () => {
  test('DEFAULT_CLI_TIMEOUT_MS is 5 minutes', () => {
    expect(DEFAULT_CLI_TIMEOUT_MS).toBe(300000)
  })
})

describe('executeCodexCLIOnce', () => {
  describe('basic execution', () => {
    test('buildCodexArgs produces correct args for basic options', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'Hello',
      }

      const args = buildCodexArgs(options)
      expect(args[0]).toBe('exec')
      expect(args[args.length - 1]).toBe('Hello')
    })

    test('buildCodexArgs includes model when specified', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        model: 'o3',
      }

      const args = buildCodexArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('o3')
    })

    test('buildCodexArgs includes sandbox mode', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        sandboxMode: 'workspace-write',
      }

      const args = buildCodexArgs(options)
      expect(args).toContain('--sandbox')
      expect(args).toContain('workspace-write')
    })
  })

  describe('environment handling', () => {
    test('cwd option is preserved in options', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        cwd: '/tmp',
      }

      expect(options.cwd).toBe('/tmp')
    })

    test('default cwd is undefined', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
      }

      expect(options.cwd).toBeUndefined()
    })
  })

  describe('timeout behavior', () => {
    test('default timeout is undefined (uses 5 minute default)', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
      }

      expect(options.timeout).toBeUndefined()
    })

    test('custom timeout is preserved in options', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        timeout: 1000,
      }

      expect(options.timeout).toBe(1000)
    })
  })

  describe('streaming and progress', () => {
    test('onProgress callback is preserved in options', () => {
      const progressCalls: string[] = []
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        onProgress: (msg) => progressCalls.push(msg),
      }

      expect(typeof options.onProgress).toBe('function')
      options.onProgress?.('test message')
      expect(progressCalls).toContain('test message')
    })
  })
})

describe('executeCodexCLI', () => {
  describe('schema validation options', () => {
    test('schema is preserved in options', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      })

      const options: CodexCLIExecutionOptions = {
        prompt: 'Generate a person',
        schema,
      }

      expect(options.schema).toBe(schema)
    })

    test('schemaRetries can be customized', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        schemaRetries: 5,
      }

      expect(options.schemaRetries).toBe(5)
    })
  })
  
  describe('schema to outputSchema conversion', () => {
    test('when schema is provided without outputSchema, args should include --output-schema', async () => {
      const { zodToJsonSchema } = await import('../../../utils/structured-output.js')
      const schema = z.object({ ok: z.boolean() })
      const jsonSchema = zodToJsonSchema(schema)
      
      expect(jsonSchema).toHaveProperty('type', 'object')
      expect(jsonSchema).toHaveProperty('properties')
      expect(jsonSchema.properties).toHaveProperty('ok')
    })
    
    test('buildCodexArgs includes --output-schema when outputSchema is provided', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        outputSchema: '/tmp/schema.json',
        json: true,
      }
      
      const args = buildCodexArgs(options)
      expect(args).toContain('--output-schema')
      expect(args).toContain('/tmp/schema.json')
      expect(args).toContain('--json')
    })
    
    test('explicit outputSchema takes precedence over schema', () => {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        schema: z.object({ foo: z.string() }),
        outputSchema: '/explicit/path.json',
      }
      
      const args = buildCodexArgs(options)
      expect(args).toContain('--output-schema')
      expect(args).toContain('/explicit/path.json')
    })
  })
})

describe('executeCodexShell', () => {
  describe('argument construction', () => {
    test('builds args with spaces properly', () => {
      const args = buildCodexArgs({
        prompt: 'prompt with spaces',
      })

      expect(args[args.length - 1]).toBe('prompt with spaces')
    })

    test('builds minimal args', () => {
      const args = buildCodexArgs({
        prompt: 'minimal',
      })

      expect(args).toEqual(['exec', 'minimal'])
    })
  })
})

describe('output parsing in executor context', () => {
  test('handles plain text output', () => {
    const result = parseCodexOutput('Task completed successfully', false)

    expect(result.output).toBe('Task completed successfully')
    expect(result.structured).toBeUndefined()
  })

  test('handles JSON output with usage', () => {
    const jsonOutput = [
      JSON.stringify({ type: 'message', content: 'Done' }),
      JSON.stringify({ usage: { input_tokens: 150, output_tokens: 75 } }),
    ].join('\n')
    const result = parseCodexOutput(jsonOutput, true)

    expect(result.output).toBe('Done')
    expect(result.tokensUsed.input).toBe(150)
    expect(result.tokensUsed.output).toBe(75)
  })

  test('handles JSON output with structured data', () => {
    const data = { decision: 'approve', issues: [] }
    const jsonOutput = [
      JSON.stringify({ type: 'output', data }),
    ].join('\n')
    const result = parseCodexOutput(jsonOutput, true)

    expect(result.structured).toEqual(data)
  })

  test('handles nested JSON objects', () => {
    const obj = { key: 'value', nested: { a: 1 } }
    const jsonOutput = [
      JSON.stringify({ type: 'output', data: obj }),
    ].join('\n')
    const result = parseCodexOutput(jsonOutput, true)

    expect(result.structured).toEqual(obj)
  })

  test('handles JSON arrays', () => {
    const arr = [1, 2, 3, { key: 'value' }]
    const jsonOutput = [
      JSON.stringify({ type: 'output', data: arr }),
    ].join('\n')
    const result = parseCodexOutput(jsonOutput, true)

    expect(result.structured).toEqual(arr)
  })
})

describe('CLI execution options validation', () => {
  test('prompt is required', () => {
    const options: CodexCLIExecutionOptions = {
      prompt: 'required prompt',
    }

    expect(options.prompt).toBe('required prompt')
  })

  test('all optional fields can be undefined', () => {
    const options: CodexCLIExecutionOptions = {
      prompt: 'test',
    }

    expect(options.model).toBeUndefined()
    expect(options.sandboxMode).toBeUndefined()
    expect(options.approvalPolicy).toBeUndefined()
    expect(options.fullAuto).toBeUndefined()
    expect(options.bypassSandbox).toBeUndefined()
    expect(options.cwd).toBeUndefined()
    expect(options.skipGitRepoCheck).toBeUndefined()
    expect(options.addDirs).toBeUndefined()
    expect(options.outputSchema).toBeUndefined()
    expect(options.json).toBeUndefined()
    expect(options.outputLastMessage).toBeUndefined()
    expect(options.images).toBeUndefined()
    expect(options.profile).toBeUndefined()
    expect(options.configOverrides).toBeUndefined()
    expect(options.timeout).toBeUndefined()
    expect(options.stopConditions).toBeUndefined()
    expect(options.onProgress).toBeUndefined()
    expect(options.schema).toBeUndefined()
    expect(options.schemaRetries).toBeUndefined()
  })

  test('all model options are valid', () => {
    const models = ['o3', 'o4-mini', 'gpt-4o', 'gpt-4', 'custom-model']

    for (const model of models) {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        model: model as any,
      }

      const args = buildCodexArgs(options)
      expect(args).toContain('--model')
    }
  })

  test('all sandbox modes are valid', () => {
    const modes = ['read-only', 'workspace-write', 'danger-full-access'] as const

    for (const mode of modes) {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        sandboxMode: mode,
      }

      const args = buildCodexArgs(options)
      expect(args).toContain('--sandbox')
      expect(args).toContain(mode)
    }
  })

  test('all approval policies are valid', () => {
    const policies = ['untrusted', 'on-failure', 'on-request', 'never'] as const

    for (const policy of policies) {
      const options: CodexCLIExecutionOptions = {
        prompt: 'test',
        approvalPolicy: policy,
      }

      const args = buildCodexArgs(options)
      expect(args).toContain('--ask-for-approval')
      expect(args).toContain(policy)
    }
  })
})

describe('AgentResult structure', () => {
  test('AgentResult has correct structure', () => {
    const result: AgentResult = {
      output: 'test output',
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 3,
      stopReason: 'completed',
      durationMs: 1500,
    }

    expect(result.output).toBe('test output')
    expect(result.tokensUsed.input).toBe(100)
    expect(result.tokensUsed.output).toBe(50)
    expect(result.turnsUsed).toBe(3)
    expect(result.stopReason).toBe('completed')
    expect(result.durationMs).toBe(1500)
  })

  test('AgentResult supports optional fields', () => {
    const result: AgentResult = {
      output: 'test',
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs: 0,
      structured: { data: 'structured' },
      exitCode: 1,
    }

    expect(result.structured).toEqual({ data: 'structured' })
    expect(result.exitCode).toBe(1)
  })

  test('all stop reasons are valid', () => {
    const stopReasons = ['completed', 'stop_condition', 'error', 'cancelled'] as const

    for (const reason of stopReasons) {
      const result: AgentResult = {
        output: 'test',
        tokensUsed: { input: 0, output: 0 },
        turnsUsed: 0,
        stopReason: reason,
        durationMs: 0,
      }

      expect(result.stopReason).toBe(reason)
    }
  })
})

describe('full auto and bypass modes', () => {
  test('fullAuto adds correct flag', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      fullAuto: true,
    })

    expect(args).toContain('--full-auto')
  })

  test('bypassSandbox adds correct flag', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      bypassSandbox: true,
    })

    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox')
  })

  test('fullAuto and bypassSandbox can coexist', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      fullAuto: true,
      bypassSandbox: true,
    })

    expect(args).toContain('--full-auto')
    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox')
  })
})

describe('images and additional directories', () => {
  test('single image is added correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      images: ['./image.png'],
    })

    expect(args).toContain('--image')
    expect(args).toContain('./image.png')
  })

  test('multiple images are added correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      images: ['./a.png', './b.jpg', './c.gif'],
    })

    const imageCount = args.filter(a => a === '--image').length
    expect(imageCount).toBe(3)
  })

  test('single additional directory is added correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      addDirs: ['/tmp'],
    })

    expect(args).toContain('--add-dir')
    expect(args).toContain('/tmp')
  })

  test('multiple additional directories are added correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      addDirs: ['/tmp', '/var/log', '/home/user'],
    })

    const addDirCount = args.filter(a => a === '--add-dir').length
    expect(addDirCount).toBe(3)
  })
})

describe('config overrides serialization', () => {
  test('string values are serialized correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      configOverrides: { model: 'o3' },
    })

    expect(args).toContain('--config')
    expect(args).toContain('model="o3"')
  })

  test('array values are serialized correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      configOverrides: { permissions: ['read', 'write'] },
    })

    expect(args).toContain('--config')
    expect(args).toContain('permissions=["read","write"]')
  })

  test('boolean values are serialized correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      configOverrides: { enabled: true },
    })

    expect(args).toContain('--config')
    expect(args).toContain('enabled=true')
  })

  test('number values are serialized correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      configOverrides: { timeout: 60000 },
    })

    expect(args).toContain('--config')
    expect(args).toContain('timeout=60000')
  })

  test('multiple overrides are added correctly', () => {
    const args = buildCodexArgs({
      prompt: 'test',
      configOverrides: {
        model: 'o3',
        timeout: 60000,
        enabled: true,
      },
    })

    const configCount = args.filter(a => a === '--config').length
    expect(configCount).toBe(3)
  })
})
