/**
 * Tests for arg-builder - pi CLI argument construction
 */
import { describe, test, expect } from 'bun:test'
import { buildPiArgs } from './arg-builder.js'
import type { PiCLIExecutionOptions } from '../types/pi.js'

describe('buildPiArgs', () => {
  test('always includes base flags: --mode json, -p, --no-session', () => {
    const args = buildPiArgs({ prompt: 'test' })
    
    expect(args).toContain('--mode')
    expect(args).toContain('json')
    expect(args).toContain('-p')
    expect(args).toContain('--no-session')
  })

  test('prompt is always last argument', () => {
    const args = buildPiArgs({ prompt: 'hello world' })
    
    expect(args[args.length - 1]).toBe('hello world')
  })

  describe('provider handling', () => {
    test('adds --provider flag when specified', () => {
      const args = buildPiArgs({ prompt: 'test', provider: 'openai' })
      
      expect(args).toContain('--provider')
      expect(args).toContain('openai')
    })

    test('omits --provider flag when undefined', () => {
      const args = buildPiArgs({ prompt: 'test' })
      
      expect(args).not.toContain('--provider')
    })
  })

  describe('model handling', () => {
    test('adds --model flag when specified', () => {
      const args = buildPiArgs({ prompt: 'test', model: 'gpt-4o' })
      
      expect(args).toContain('--model')
      expect(args).toContain('gpt-4o')
    })

    test('omits --model flag when undefined', () => {
      const args = buildPiArgs({ prompt: 'test' })
      
      expect(args).not.toContain('--model')
    })
  })

  describe('thinking handling', () => {
    test('adds --thinking flag for each level', () => {
      const levels = ['off', 'minimal', 'low', 'medium', 'high'] as const
      
      for (const level of levels) {
        const args = buildPiArgs({ prompt: 'test', thinking: level })
        expect(args).toContain('--thinking')
        expect(args).toContain(level)
      }
    })

    test('omits --thinking flag when undefined', () => {
      const args = buildPiArgs({ prompt: 'test' })
      
      expect(args).not.toContain('--thinking')
    })
  })

  describe('system prompt handling', () => {
    test('adds --system-prompt flag when specified', () => {
      const args = buildPiArgs({ prompt: 'test', systemPrompt: 'You are helpful' })
      
      expect(args).toContain('--system-prompt')
      expect(args).toContain('You are helpful')
    })

    test('omits --system-prompt flag when undefined', () => {
      const args = buildPiArgs({ prompt: 'test' })
      
      expect(args).not.toContain('--system-prompt')
    })
  })

  describe('append system prompt handling', () => {
    test('adds --append-system-prompt flag when specified', () => {
      const args = buildPiArgs({ prompt: 'test', appendSystemPrompt: 'Extra instructions' })
      
      expect(args).toContain('--append-system-prompt')
      expect(args).toContain('Extra instructions')
    })

    test('omits --append-system-prompt flag when undefined', () => {
      const args = buildPiArgs({ prompt: 'test' })
      
      expect(args).not.toContain('--append-system-prompt')
    })
  })

  describe('tools handling', () => {
    test('adds --tools flag with comma-separated list', () => {
      const args = buildPiArgs({ prompt: 'test', tools: ['read', 'bash', 'edit'] })
      
      expect(args).toContain('--tools')
      expect(args).toContain('read,bash,edit')
    })

    test('single tool', () => {
      const args = buildPiArgs({ prompt: 'test', tools: ['bash'] })
      
      expect(args).toContain('--tools')
      expect(args).toContain('bash')
    })

    test('omits --tools flag when empty array', () => {
      const args = buildPiArgs({ prompt: 'test', tools: [] })
      
      expect(args).not.toContain('--tools')
    })

    test('omits --tools flag when undefined', () => {
      const args = buildPiArgs({ prompt: 'test' })
      
      expect(args).not.toContain('--tools')
    })
  })

  describe('combined options', () => {
    test('builds correct args with all options', () => {
      const args = buildPiArgs({
        prompt: 'write tests',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        thinking: 'medium',
        systemPrompt: 'Be concise',
        appendSystemPrompt: 'Use TypeScript',
        tools: ['read', 'write'],
      })

      expect(args).toContain('--mode')
      expect(args).toContain('json')
      expect(args).toContain('-p')
      expect(args).toContain('--no-session')
      expect(args).toContain('--provider')
      expect(args).toContain('anthropic')
      expect(args).toContain('--model')
      expect(args).toContain('claude-sonnet-4-20250514')
      expect(args).toContain('--thinking')
      expect(args).toContain('medium')
      expect(args).toContain('--system-prompt')
      expect(args).toContain('Be concise')
      expect(args).toContain('--append-system-prompt')
      expect(args).toContain('Use TypeScript')
      expect(args).toContain('--tools')
      expect(args).toContain('read,write')
      expect(args[args.length - 1]).toBe('write tests')
    })

    test('minimal options includes base flags and prompt', () => {
      const args = buildPiArgs({ prompt: 'hello' })

      expect(args).toEqual(['--mode', 'json', '-p', '--no-session', 'hello'])
    })
  })
})
