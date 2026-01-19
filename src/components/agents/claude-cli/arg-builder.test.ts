/**
 * Tests for arg-builder - CLI argument construction
 */

import { describe, test, expect } from 'bun:test'
import { buildClaudeArgs, modelMap, permissionFlags, formatMap } from './arg-builder.js'

describe('modelMap', () => {
  test('maps opus to claude-opus-4-20250514', () => {
    expect(modelMap.opus).toBe('claude-opus-4-20250514')
  })

  test('maps sonnet to claude-sonnet-4-20250514', () => {
    expect(modelMap.sonnet).toBe('claude-sonnet-4-20250514')
  })

  test('maps haiku to claude-haiku-3-20250514', () => {
    expect(modelMap.haiku).toBe('claude-haiku-3-20250514')
  })
})

describe('permissionFlags', () => {
  test('default returns empty array', () => {
    expect(permissionFlags.default).toEqual([])
  })

  test('acceptEdits returns skip-permissions flag', () => {
    expect(permissionFlags.acceptEdits).toEqual(['--dangerously-skip-permissions'])
  })

  test('bypassPermissions returns skip-permissions flag', () => {
    expect(permissionFlags.bypassPermissions).toEqual(['--dangerously-skip-permissions'])
  })
})

describe('formatMap', () => {
  test('maps text to text', () => {
    expect(formatMap.text).toBe('text')
  })

  test('maps json to json', () => {
    expect(formatMap.json).toBe('json')
  })

  test('maps stream-json to stream-json', () => {
    expect(formatMap['stream-json']).toBe('stream-json')
  })
})

describe('buildClaudeArgs', () => {
  test('always includes --print flag first', () => {
    const args = buildClaudeArgs({ prompt: 'test' })

    expect(args[0]).toBe('--print')
  })

  test('adds prompt as last argument', () => {
    const args = buildClaudeArgs({ prompt: 'hello world' })

    expect(args[args.length - 1]).toBe('hello world')
  })

  describe('model handling', () => {
    test('maps shorthand model name', () => {
      const args = buildClaudeArgs({ prompt: 'test', model: 'opus' })

      expect(args).toContain('--model')
      expect(args).toContain('claude-opus-4-20250514')
    })

    test('passes through custom model name', () => {
      const args = buildClaudeArgs({ prompt: 'test', model: 'claude-custom-model' })

      expect(args).toContain('--model')
      expect(args).toContain('claude-custom-model')
    })

    test('omits model flag when not specified', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--model')
    })
  })

  describe('maxTurns handling', () => {
    test('adds max-turns flag', () => {
      const args = buildClaudeArgs({ prompt: 'test', maxTurns: 5 })

      expect(args).toContain('--max-turns')
      expect(args).toContain('5')
    })

    test('handles zero maxTurns', () => {
      const args = buildClaudeArgs({ prompt: 'test', maxTurns: 0 })

      expect(args).toContain('--max-turns')
      expect(args).toContain('0')
    })

    test('omits max-turns flag when undefined', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--max-turns')
    })
  })

  describe('permission mode handling', () => {
    test('adds flags for acceptEdits mode', () => {
      const args = buildClaudeArgs({ prompt: 'test', permissionMode: 'acceptEdits' })

      expect(args).toContain('--dangerously-skip-permissions')
    })

    test('adds flags for bypassPermissions mode', () => {
      const args = buildClaudeArgs({ prompt: 'test', permissionMode: 'bypassPermissions' })

      expect(args).toContain('--dangerously-skip-permissions')
    })

    test('adds no flags for default mode', () => {
      const args = buildClaudeArgs({ prompt: 'test', permissionMode: 'default' })

      expect(args).not.toContain('--dangerously-skip-permissions')
    })

    test('omits permission flags when undefined', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--dangerously-skip-permissions')
    })
  })

  describe('system prompt handling', () => {
    test('adds system-prompt flag', () => {
      const args = buildClaudeArgs({ prompt: 'test', systemPrompt: 'You are helpful' })

      expect(args).toContain('--system-prompt')
      expect(args).toContain('You are helpful')
    })

    test('omits system-prompt flag when undefined', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--system-prompt')
    })
  })

  describe('output format handling', () => {
    test('adds output-format flag for json', () => {
      const args = buildClaudeArgs({ prompt: 'test', outputFormat: 'json' })

      expect(args).toContain('--output-format')
      expect(args).toContain('json')
    })

    test('adds output-format flag for stream-json', () => {
      const args = buildClaudeArgs({ prompt: 'test', outputFormat: 'stream-json' })

      expect(args).toContain('--output-format')
      expect(args).toContain('stream-json')
    })

    test('omits output-format flag when undefined', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--output-format')
    })
  })

  describe('MCP config handling', () => {
    test('adds mcp-config flag', () => {
      const args = buildClaudeArgs({ prompt: 'test', mcpConfig: '/path/to/mcp.json' })

      expect(args).toContain('--mcp-config')
      expect(args).toContain('/path/to/mcp.json')
    })

    test('omits mcp-config flag when undefined', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--mcp-config')
    })
  })

  describe('allowed tools handling', () => {
    test('adds allowedTools flags for each tool', () => {
      const args = buildClaudeArgs({
        prompt: 'test',
        allowedTools: ['Read', 'Write', 'Bash']
      })

      // Should have three --allowedTools flags
      const allowedCount = args.filter(a => a === '--allowedTools').length
      expect(allowedCount).toBe(3)
      expect(args).toContain('Read')
      expect(args).toContain('Write')
      expect(args).toContain('Bash')
    })

    test('omits allowedTools when empty array', () => {
      const args = buildClaudeArgs({ prompt: 'test', allowedTools: [] })

      expect(args).not.toContain('--allowedTools')
    })

    test('omits allowedTools when undefined', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--allowedTools')
    })
  })

  describe('disallowed tools handling', () => {
    test('adds disallowedTools flags for each tool', () => {
      const args = buildClaudeArgs({
        prompt: 'test',
        disallowedTools: ['Bash', 'Edit']
      })

      const disallowedCount = args.filter(a => a === '--disallowedTools').length
      expect(disallowedCount).toBe(2)
      expect(args).toContain('Bash')
      expect(args).toContain('Edit')
    })

    test('omits disallowedTools when empty array', () => {
      const args = buildClaudeArgs({ prompt: 'test', disallowedTools: [] })

      expect(args).not.toContain('--disallowedTools')
    })
  })

  describe('continue conversation handling', () => {
    test('adds continue flag when true', () => {
      const args = buildClaudeArgs({ prompt: 'test', continue: true })

      expect(args).toContain('--continue')
    })

    test('omits continue flag when false', () => {
      const args = buildClaudeArgs({ prompt: 'test', continue: false })

      expect(args).not.toContain('--continue')
    })

    test('omits continue flag when undefined', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--continue')
    })
  })

  describe('resume session handling', () => {
    test('adds resume flag with session id', () => {
      const args = buildClaudeArgs({ prompt: 'test', resume: 'session-123' })

      expect(args).toContain('--resume')
      expect(args).toContain('session-123')
    })

    test('omits resume flag when undefined', () => {
      const args = buildClaudeArgs({ prompt: 'test' })

      expect(args).not.toContain('--resume')
    })
  })

  describe('combined options', () => {
    test('builds correct args with all options', () => {
      const args = buildClaudeArgs({
        prompt: 'write a test',
        model: 'sonnet',
        maxTurns: 10,
        permissionMode: 'acceptEdits',
        systemPrompt: 'Be concise',
        outputFormat: 'json',
        mcpConfig: '/mcp.json',
        allowedTools: ['Read'],
        disallowedTools: ['Bash'],
        continue: true,
        resume: 'session-1'
      })

      expect(args[0]).toBe('--print')
      expect(args).toContain('--model')
      expect(args).toContain('claude-sonnet-4-20250514')
      expect(args).toContain('--max-turns')
      expect(args).toContain('10')
      expect(args).toContain('--dangerously-skip-permissions')
      expect(args).toContain('--system-prompt')
      expect(args).toContain('Be concise')
      expect(args).toContain('--output-format')
      expect(args).toContain('json')
      expect(args).toContain('--mcp-config')
      expect(args).toContain('/mcp.json')
      expect(args).toContain('--allowedTools')
      expect(args).toContain('Read')
      expect(args).toContain('--disallowedTools')
      expect(args).toContain('Bash')
      expect(args).toContain('--continue')
      expect(args).toContain('--resume')
      expect(args).toContain('session-1')
      expect(args[args.length - 1]).toBe('write a test')
    })

    test('minimal options only includes print and prompt', () => {
      const args = buildClaudeArgs({ prompt: 'hello' })

      expect(args).toEqual(['--print', 'hello'])
    })
  })
})
