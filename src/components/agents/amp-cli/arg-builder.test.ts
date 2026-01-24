/**
 * Tests for arg-builder - Amp CLI argument construction
 */

import { describe, test, expect } from 'bun:test'
import { buildAmpArgs, buildAmpEnv, modeMap } from './arg-builder.js'

describe('modeMap', () => {
  test('maps smart to smart', () => {
    expect(modeMap.smart).toBe('smart')
  })

  test('maps rush to rush', () => {
    expect(modeMap.rush).toBe('rush')
  })
})

describe('buildAmpArgs', () => {
  describe('basic execution', () => {
    test('includes --execute and --stream-json by default', () => {
      const args = buildAmpArgs({ prompt: 'test' })

      expect(args).toContain('--execute')
      expect(args).toContain('--stream-json')
    })

    test('does not include prompt in args (sent via stdin)', () => {
      const args = buildAmpArgs({ prompt: 'hello world' })

      expect(args).not.toContain('hello world')
    })
  })

  describe('mode handling', () => {
    test('adds mode flag for smart mode', () => {
      const args = buildAmpArgs({ prompt: 'test', mode: 'smart' })

      expect(args).toContain('--mode')
      expect(args).toContain('smart')
    })

    test('adds mode flag for rush mode', () => {
      const args = buildAmpArgs({ prompt: 'test', mode: 'rush' })

      expect(args).toContain('--mode')
      expect(args).toContain('rush')
    })

    test('omits mode flag when not specified', () => {
      const args = buildAmpArgs({ prompt: 'test' })

      expect(args).not.toContain('--mode')
    })
  })

  describe('maxTurns handling', () => {
    test('does not add max-turns flag (amp CLI does not support it)', () => {
      const args = buildAmpArgs({ prompt: 'test', maxTurns: 5 })

      // maxTurns is handled via prompt injection in executor, not CLI flag
      expect(args).not.toContain('--max-turns')
    })

    test('maxTurns is ignored in arg builder', () => {
      const args = buildAmpArgs({ prompt: 'test', maxTurns: 0 })

      expect(args).not.toContain('--max-turns')
      expect(args).not.toContain('0')
    })
  })

  describe('system prompt handling', () => {
    test('adds system-prompt flag', () => {
      const args = buildAmpArgs({ prompt: 'test', systemPrompt: 'You are helpful' })

      expect(args).toContain('--system-prompt')
      expect(args).toContain('You are helpful')
    })

    test('omits system-prompt flag when undefined', () => {
      const args = buildAmpArgs({ prompt: 'test' })

      expect(args).not.toContain('--system-prompt')
    })
  })

  describe('permission mode handling', () => {
    test('adds dangerously-allow-all for bypassPermissions', () => {
      const args = buildAmpArgs({ prompt: 'test', permissionMode: 'bypassPermissions' })

      expect(args).toContain('--dangerously-allow-all')
    })

    test('no permission flags for default mode', () => {
      const args = buildAmpArgs({ prompt: 'test', permissionMode: 'default' })

      expect(args).not.toContain('--dangerously-allow-all')
    })

    test('no permission flags for acceptEdits mode', () => {
      const args = buildAmpArgs({ prompt: 'test', permissionMode: 'acceptEdits' })

      expect(args).not.toContain('--dangerously-allow-all')
    })

    test('omits permission flags when undefined', () => {
      const args = buildAmpArgs({ prompt: 'test' })

      expect(args).not.toContain('--dangerously-allow-all')
    })
  })

  describe('labels handling', () => {
    test('adds label flags for each label', () => {
      const args = buildAmpArgs({
        prompt: 'test',
        labels: ['bug-fix', 'urgent']
      })

      const labelCount = args.filter(a => a === '--label').length
      expect(labelCount).toBe(2)
      expect(args).toContain('bug-fix')
      expect(args).toContain('urgent')
    })

    test('omits labels when empty array', () => {
      const args = buildAmpArgs({ prompt: 'test', labels: [] })

      expect(args).not.toContain('--label')
    })

    test('omits labels when undefined', () => {
      const args = buildAmpArgs({ prompt: 'test' })

      expect(args).not.toContain('--label')
    })
  })

  describe('thread continuation handling', () => {
    test('uses threads continue --last for continue flag', () => {
      const args = buildAmpArgs({ prompt: 'test', continue: true })

      expect(args[0]).toBe('threads')
      expect(args[1]).toBe('continue')
      expect(args).toContain('--last')
      expect(args).toContain('--execute')
    })

    test('uses threads continue --thread-id for resume', () => {
      const args = buildAmpArgs({ prompt: 'test', resume: 'thread-abc123' })

      expect(args[0]).toBe('threads')
      expect(args[1]).toBe('continue')
      expect(args).toContain('--thread-id')
      expect(args).toContain('thread-abc123')
      expect(args).toContain('--execute')
    })

    test('resume takes precedence over continue', () => {
      const args = buildAmpArgs({
        prompt: 'test',
        continue: true,
        resume: 'thread-xyz'
      })

      expect(args).toContain('--thread-id')
      expect(args).toContain('thread-xyz')
      expect(args).not.toContain('--last')
    })

    test('standard execution when not continuing', () => {
      const args = buildAmpArgs({ prompt: 'test' })

      expect(args[0]).toBe('--execute')
      expect(args).not.toContain('threads')
      expect(args).not.toContain('continue')
    })
  })

  describe('combined options', () => {
    test('builds correct args with all options', () => {
      const args = buildAmpArgs({
        prompt: 'write a test',
        mode: 'smart',
        maxTurns: 10,
        permissionMode: 'bypassPermissions',
        systemPrompt: 'Be concise',
        labels: ['test', 'feature'],
      })

      expect(args).toContain('--execute')
      expect(args).toContain('--stream-json')
      expect(args).toContain('--mode')
      expect(args).toContain('smart')
      // maxTurns is NOT passed as CLI flag (handled via prompt injection)
      expect(args).not.toContain('--max-turns')
      expect(args).toContain('--dangerously-allow-all')
      expect(args).toContain('--system-prompt')
      expect(args).toContain('Be concise')
      expect(args).toContain('--label')
      expect(args).toContain('test')
      expect(args).toContain('feature')
    })

    test('minimal options includes execute and stream-json', () => {
      const args = buildAmpArgs({ prompt: 'hello' })

      expect(args).toContain('--execute')
      expect(args).toContain('--stream-json')
      expect(args.length).toBe(2)
    })
  })
})

describe('buildAmpEnv', () => {
  test('returns empty object by default', () => {
    const env = buildAmpEnv({ prompt: 'test' })

    expect(env).toEqual({})
  })

  test('does not override AMP_API_KEY', () => {
    const env = buildAmpEnv({ prompt: 'test' })

    expect(env.AMP_API_KEY).toBeUndefined()
  })
})
