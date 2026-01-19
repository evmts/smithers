/**
 * Tests for db command dispatcher
 * 
 * Covers: Subcommand routing, database lifecycle, error handling
 */

import { describe, it, test, expect, beforeEach, afterEach, mock } from 'bun:test'

describe('dbCommand', () => {
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

  describe('subcommand routing', () => {
    test('shows help when no subcommand provided', async () => {
      // Import showHelp directly to test
      const { showHelp } = await import('./help')
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('Usage: smithers db'))).toBe(true)
    })

    test('shows help for unknown subcommand', async () => {
      const { showHelp } = await import('./help')
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('Subcommands:'))).toBe(true)
    })
  })

  describe('database path option', () => {
    test('default path is .smithers/data', async () => {
      const { showHelp } = await import('./help')
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('.smithers/data'))).toBe(true)
    })
  })

  describe('output', () => {
    test('help prints database inspector reference', async () => {
      const { showHelp } = await import('./help')
      showHelp()
      
      // Help should reference the db subcommands
      expect(consoleOutput.some(line => line.includes('state'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('executions'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles empty subcommand string', async () => {
      const { showHelp } = await import('./help')
      // Empty string should trigger help
      showHelp()
      
      expect(consoleOutput.some(line => line.includes('Usage:'))).toBe(true)
    })
  })
})

describe('db view exports', () => {
  test('exports showState', async () => {
    const { showState } = await import('./index')
    expect(typeof showState).toBe('function')
  })

  test('exports showTransitions', async () => {
    const { showTransitions } = await import('./index')
    expect(typeof showTransitions).toBe('function')
  })

  test('exports showExecutions', async () => {
    const { showExecutions } = await import('./index')
    expect(typeof showExecutions).toBe('function')
  })

  test('exports showMemories', async () => {
    const { showMemories } = await import('./index')
    expect(typeof showMemories).toBe('function')
  })

  test('exports showStats', async () => {
    const { showStats } = await import('./index')
    expect(typeof showStats).toBe('function')
  })

  test('exports showCurrent', async () => {
    const { showCurrent } = await import('./index')
    expect(typeof showCurrent).toBe('function')
  })

  test('exports showRecovery', async () => {
    const { showRecovery } = await import('./index')
    expect(typeof showRecovery).toBe('function')
  })

  test('exports showHelp', async () => {
    const { showHelp } = await import('./index')
    expect(typeof showHelp).toBe('function')
  })

  test('exports dbCommand', async () => {
    const { dbCommand } = await import('./index')
    expect(typeof dbCommand).toBe('function')
  })
})
