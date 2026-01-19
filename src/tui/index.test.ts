/**
 * Tests for src/tui/index.tsx
 * TUI entry point and launchTUI function
 */

import { describe, test } from 'bun:test'

describe('tui/index', () => {
  describe('launchTUI function', () => {
    test.todo('exports launchTUI function')
    test.todo('launchTUI accepts empty options object')
    test.todo('launchTUI uses default dbPath when not provided')
    test.todo('launchTUI uses custom dbPath when provided')
    test.todo('launchTUI returns a Promise<void>')
  })

  describe('TUIOptions interface', () => {
    test.todo('dbPath is optional')
    test.todo('dbPath defaults to .smithers/data')
  })

  describe('renderer initialization', () => {
    test.todo('creates CLI renderer via createCliRenderer')
    test.todo('creates React root via createRoot')
    test.todo('renders App component with correct dbPath prop')
  })

  describe('direct execution (import.meta.main)', () => {
    test.todo('uses process.argv[2] as dbPath when run directly')
    test.todo('falls back to .smithers/data when no arg provided')
  })

  describe('error handling', () => {
    test.todo('handles renderer creation failure gracefully')
    test.todo('handles invalid dbPath gracefully')
  })
})
