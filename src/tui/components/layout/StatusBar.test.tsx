/**
 * Tests for src/tui/components/layout/StatusBar.tsx
 * Status bar showing connection state and help hints
 */

import { describe, test } from 'bun:test'

describe('tui/components/layout/StatusBar', () => {
  describe('connection status display', () => {
    test.todo('shows "[Connected]" when isConnected is true')
    test.todo('shows "[Disconnected]" when isConnected is false')
    test.todo('uses green (#9ece6a) for connected')
    test.todo('uses red (#f7768e) for disconnected')
  })

  describe('dbPath display', () => {
    test.todo('displays dbPath prop')
    test.todo('uses gray (#565f89) color')
  })

  describe('error display', () => {
    test.todo('shows error message when error prop is set')
    test.todo('prefixes error with "Error: "')
    test.todo('uses red (#f7768e) for error')
    test.todo('does not render error when error is null')
  })

  describe('help hints', () => {
    test.todo('displays "q:quit  Tab:next  j/k:nav  Enter:select"')
    test.todo('uses gray (#565f89) color')
  })

  describe('layout', () => {
    test.todo('has height of 2')
    test.todo('has full width')
    test.todo('uses row flex direction')
    test.todo('justifies content space-between')
    test.todo('has left and right padding of 1')
  })

  describe('edge cases', () => {
    test.todo('handles very long dbPath')
    test.todo('handles very long error message')
    test.todo('handles empty dbPath')
    test.todo('handles special characters in error')
  })
})
