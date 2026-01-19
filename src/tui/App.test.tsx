import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import React from 'react'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { App, type AppHooks } from './App.js'
import { readTuiState, resetTuiState } from './state.js'
import { waitForEffects } from './test-utils.js'

function createHooks(overrides?: Partial<AppHooks>) {
  let keyboardHandler: ((key: any) => void) | null = null
  const destroy = mock(() => {})

  return {
    keyboardHandlerRef: () => keyboardHandler,
    destroy,
    hooks: {
      useKeyboard: (handler: any) => {
        keyboardHandler = handler
      },
      useRenderer: () => ({ destroy } as any),
      useTerminalDimensions: () => ({ height: 24, width: 80 }),
      useSmithersConnection: () => ({
        db: null,
        isConnected: false,
        error: null,
        currentExecution: null,
        executions: [],
      }),
      useReportGenerator: () => ({
        reports: [],
        isGenerating: false,
        lastGeneratedAt: null,
        generateNow: async () => {},
      }),
      ...(overrides ?? {}),
    },
  }
}

describe('App keyboard handling', () => {
  let root: SmithersRoot

  beforeEach(() => {
    resetTuiState()
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
    resetTuiState()
  })

  test('maps function keys to tabs', async () => {
    const { hooks, keyboardHandlerRef } = createHooks()

    await root.render(<App dbPath="/tmp" hooks={hooks} />)

    const handler = keyboardHandlerRef()
    expect(handler).not.toBeNull()

    handler!({ name: 'f2', ctrl: false, shift: false })
    await waitForEffects()
    expect(readTuiState('tui:app:activeTab', 'timeline')).toBe('frames')
  })

  test('cycles tabs with Tab when not captured', async () => {
    const { hooks, keyboardHandlerRef } = createHooks()

    await root.render(<App dbPath="/tmp" hooks={hooks} />)

    const handler = keyboardHandlerRef()
    handler!({ name: 'tab', ctrl: false, shift: false })
    await waitForEffects()

    expect(readTuiState('tui:app:activeTab', 'timeline')).toBe('frames')
  })

  test('does not cycle tabs when chat captures Tab', async () => {
    const { hooks, keyboardHandlerRef } = createHooks()

    await root.render(<App dbPath="/tmp" hooks={hooks} />)

    let handler = keyboardHandlerRef()
    handler!({ name: 'f4', ctrl: false, shift: false })
    await waitForEffects()
    expect(readTuiState('tui:app:activeTab', 'timeline')).toBe('chat')

    handler = keyboardHandlerRef()
    handler!({ name: 'tab', ctrl: false, shift: false })
    await waitForEffects()
    expect(readTuiState('tui:app:activeTab', 'timeline')).toBe('chat')
  })

  test('quits on ctrl+c or ctrl+q', async () => {
    const { hooks, keyboardHandlerRef, destroy } = createHooks()
    const originalExit = process.exit
    let exitCode: number | undefined

    process.exit = ((code?: number) => {
      exitCode = code ?? 0
    }) as any

    try {
      await root.render(<App dbPath="/tmp" hooks={hooks} />)

      const handler = keyboardHandlerRef()
      handler!({ name: 'c', ctrl: true, shift: false })

      expect(destroy).toHaveBeenCalled()
      expect(exitCode).toBe(0)
    } finally {
      process.exit = originalExit
    }
  })
})
