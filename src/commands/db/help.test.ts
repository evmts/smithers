/**
 * Tests for help display
 * 
 * Covers: Help text output, subcommand documentation
 */

import { describe, it, test, expect, beforeEach, afterEach } from 'bun:test'
import { showHelp } from './help'

describe('showHelp', () => {
  let consoleOutput: string[]
  let originalConsoleLog: typeof console.log

  beforeEach(() => {
    consoleOutput = []
    originalConsoleLog = console.log
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    console.log = originalConsoleLog
  })

  describe('usage line', () => {
    test('prints usage with command syntax', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('Usage: smithers db'))).toBe(true)
    })

    test('shows <subcommand> placeholder', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('<subcommand>'))).toBe(true)
    })

    test('shows [options] placeholder', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('[options]'))).toBe(true)
    })
  })

  describe('subcommands section', () => {
    test('lists state subcommand with description', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('state') && line.includes('Show current state'))).toBe(true)
    })

    test('lists transitions subcommand with description', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('transitions') && line.includes('transition history'))).toBe(true)
    })

    test('lists executions subcommand with description', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('executions') && line.includes('recent executions'))).toBe(true)
    })

    test('lists memories subcommand with description', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('memories') && line.includes('memories'))).toBe(true)
    })

    test('lists stats subcommand with description', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('stats') && line.includes('statistics'))).toBe(true)
    })

    test('lists current subcommand with description', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('current') && line.includes('current execution'))).toBe(true)
    })

    test('lists recovery subcommand with description', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('recovery') && line.includes('incomplete'))).toBe(true)
    })
  })

  describe('options section', () => {
    test('lists --path option', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('--path'))).toBe(true)
    })

    test('shows default value for --path', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('.smithers/data'))).toBe(true)
    })
  })

  describe('formatting', () => {
    test('uses consistent indentation for subcommands', () => {
      showHelp()
      
      // All subcommand lines should start with spaces
      const subcommandLines = consoleOutput.filter(line => 
        line.includes('state') || 
        line.includes('transitions') || 
        line.includes('executions')
      )
      
      for (const line of subcommandLines) {
        expect(line.startsWith('  ')).toBe(true)
      }
    })

    test('has Subcommands section header', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('Subcommands:'))).toBe(true)
    })

    test('has Options section header', () => {
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('Options:'))).toBe(true)
    })
  })

  describe('completeness', () => {
    test('documents all 7 subcommands', () => {
      showHelp()
      
      const output = consoleOutput.join('\n')
      const subcommands = ['state', 'transitions', 'executions', 'memories', 'stats', 'current', 'recovery']
      
      for (const cmd of subcommands) {
        expect(output).toContain(cmd)
      }
    })
  })
})
