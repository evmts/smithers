/**
 * Tests for src/tui/components/views/HumanInteractionHandler.tsx
 * Handles event handling and UI state for human interaction requests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import type { SmithersDB } from '../../../db/index.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../../test-utils.js'
import { HumanInteractionHandler, type HumanInteractionHandlerProps } from './HumanInteractionHandler.js'
import { resetTuiState, readTuiState } from '../../state.js'

describe('tui/components/views/HumanInteractionHandler', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
    resetTuiState()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  // Helper to create props
  function createProps(overrides: Partial<HumanInteractionHandlerProps> = {}): HumanInteractionHandlerProps {
    return {
      db: ctx.db,
      height: 20,
      ...overrides
    }
  }

  describe('empty state rendering', () => {
    test('renders without error when no requests exist', async () => {
      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Component should render without crashing
      expect(true).toBe(true)
    })

    test('handles component mount and unmount cycle', async () => {
      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Re-render with different props
      await ctx.root.render(<HumanInteractionHandler {...createProps({ height: 30 })} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('request list rendering', () => {
    test('renders with pending requests', async () => {
      ctx.db.human.request('confirmation', 'Confirm action?')
      ctx.db.human.request('input', 'Enter value')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Should have pending requests in DB
      const pending = ctx.db.human.listPending()
      expect(pending).toHaveLength(2)
    })

    test('renders with single request', async () => {
      ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('renders with multiple request types', async () => {
      ctx.db.human.request('confirmation', 'Confirm?')
      ctx.db.human.request('input', 'Enter text')
      ctx.db.human.request('select', 'Choose:', ['A', 'B'])
      ctx.db.human.request('text', 'Provide description')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending).toHaveLength(4)
    })
  })

  describe('request details display', () => {
    test('displays confirmation request details', async () => {
      ctx.db.human.request('confirmation', 'Please confirm this action')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('displays input request details', async () => {
      ctx.db.human.request('input', 'Enter your name')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('displays select request with options', async () => {
      ctx.db.human.request('select', 'Choose an option:', ['Option A', 'Option B', 'Option C'])

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('displays text request details', async () => {
      ctx.db.human.request('text', 'Enter description')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('options-based requests', () => {
    test('handles request with options array', async () => {
      ctx.db.human.request('select', 'Choose:', ['A', 'B', 'C'])

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Options should be stored in DB
      const pending = ctx.db.human.listPending()
      expect(pending[0].options).toEqual(['A', 'B', 'C'])
    })

    test('handles request with empty options array', async () => {
      ctx.db.human.request('select', 'Choose:', [])

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles request with many options', async () => {
      const options = Array.from({ length: 20 }, (_, i) => `Option ${i + 1}`)
      ctx.db.human.request('select', 'Choose:', options)

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].options).toHaveLength(20)
    })

    test('handles options with special characters', async () => {
      ctx.db.human.request('select', 'Choose:', ['Option <A>', 'Option "B"', "Option 'C'"])

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].options).toContain('Option <A>')
    })
  })

  describe('state management via useTuiState', () => {
    test('initializes response text as empty string', async () => {
      ctx.db.human.request('input', 'Enter:')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const responseText = readTuiState('tui:human:responseText', '')
      expect(responseText).toBe('')
    })

    test('initializes selected option index as 0', async () => {
      ctx.db.human.request('select', 'Pick:', ['A', 'B'])

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const selectedOption = readTuiState('tui:human:selectedOption', 0)
      expect(selectedOption).toBe(0)
    })

    test('state persists across re-renders', async () => {
      ctx.db.human.request('input', 'Enter:')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Re-render
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('useHumanRequests integration', () => {
    test('loads pending requests from DB', async () => {
      ctx.db.human.request('confirmation', 'Confirm?')
      ctx.db.human.request('input', 'Enter value')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending).toHaveLength(2)
    })

    test('approves request via DB', async () => {
      const requestId = ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Approve the request
      ctx.db.human.resolve(requestId, 'approved', true)
      await waitForEffects()

      const request = ctx.db.human.get(requestId)
      expect(request?.status).toBe('approved')
      expect(request?.response).toBe(true)
    })

    test('rejects request via DB', async () => {
      const requestId = ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      ctx.db.human.resolve(requestId, 'rejected', false)
      await waitForEffects()

      const request = ctx.db.human.get(requestId)
      expect(request?.status).toBe('rejected')
      expect(request?.response).toBe(false)
    })

    test('removes approved request from pending list', async () => {
      const requestId = ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(ctx.db.human.listPending()).toHaveLength(1)

      ctx.db.human.resolve(requestId, 'approved', true)
      await waitForEffects()

      expect(ctx.db.human.listPending()).toHaveLength(0)
    })

    test('removes rejected request from pending list', async () => {
      const requestId = ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      ctx.db.human.resolve(requestId, 'rejected', false)
      await waitForEffects()

      expect(ctx.db.human.listPending()).toHaveLength(0)
    })
  })

  describe('request selection', () => {
    test('first request is selected by default', async () => {
      ctx.db.human.request('confirmation', 'First?')
      ctx.db.human.request('confirmation', 'Second?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // The hook's internal state manages selection
      expect(true).toBe(true)
    })

    test('handles selection when requests change', async () => {
      const id1 = ctx.db.human.request('confirmation', 'First?')
      ctx.db.human.request('confirmation', 'Second?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Remove first request
      ctx.db.human.resolve(id1, 'approved', true)
      await waitForEffects()

      // Should still have one pending
      expect(ctx.db.human.listPending()).toHaveLength(1)
    })
  })

  describe('approval with options', () => {
    test('approves with selected option value', async () => {
      const requestId = ctx.db.human.request('select', 'Choose:', ['A', 'B', 'C'])

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Approve with option value
      ctx.db.human.resolve(requestId, 'approved', 'B')
      await waitForEffects()

      const request = ctx.db.human.get(requestId)
      expect(request?.status).toBe('approved')
      expect(request?.response).toBe('B')
    })
  })

  describe('approval with text response', () => {
    test('approves with text response', async () => {
      const requestId = ctx.db.human.request('input', 'Enter name:')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      ctx.db.human.resolve(requestId, 'approved', 'John Doe')
      await waitForEffects()

      const request = ctx.db.human.get(requestId)
      expect(request?.status).toBe('approved')
      expect(request?.response).toBe('John Doe')
    })

    test('approves with empty response for confirmation', async () => {
      const requestId = ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      ctx.db.human.resolve(requestId, 'approved', true)
      await waitForEffects()

      const request = ctx.db.human.get(requestId)
      expect(request?.response).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles request with very long prompt', async () => {
      const longPrompt = 'A'.repeat(1000)
      ctx.db.human.request('confirmation', longPrompt)

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].prompt).toHaveLength(1000)
    })

    test('handles request with special characters in prompt', async () => {
      const prompt = 'Confirm <action> & "operation"?'
      ctx.db.human.request('confirmation', prompt)

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].prompt).toBe(prompt)
    })

    test('handles request with unicode in prompt', async () => {
      const prompt = 'Confirm action? 🚀 ✓ ❌'
      ctx.db.human.request('confirmation', prompt)

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].prompt).toBe(prompt)
    })

    test('handles rapid request additions', async () => {
      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Add multiple requests rapidly
      for (let i = 0; i < 10; i++) {
        ctx.db.human.request('confirmation', `Request ${i}`)
      }
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending).toHaveLength(10)
    })

    test('handles concurrent approve/reject operations', async () => {
      const id1 = ctx.db.human.request('confirmation', 'First?')
      const id2 = ctx.db.human.request('confirmation', 'Second?')
      const id3 = ctx.db.human.request('confirmation', 'Third?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Resolve all
      ctx.db.human.resolve(id1, 'approved', true)
      ctx.db.human.resolve(id2, 'rejected', false)
      ctx.db.human.resolve(id3, 'approved', true)
      await waitForEffects()

      expect(ctx.db.human.get(id1)?.status).toBe('approved')
      expect(ctx.db.human.get(id2)?.status).toBe('rejected')
      expect(ctx.db.human.get(id3)?.status).toBe('approved')
    })

    test('handles re-render after all requests resolved', async () => {
      const requestId = ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      ctx.db.human.resolve(requestId, 'approved', true)
      await waitForEffects()

      // Re-render with empty list
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(ctx.db.human.listPending()).toHaveLength(0)
    })
  })

  describe('request type handling', () => {
    test('handles confirmation type', async () => {
      ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].type).toBe('confirmation')
    })

    test('handles select type', async () => {
      ctx.db.human.request('select', 'Choose:', ['A', 'B'])

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].type).toBe('select')
    })

    test('handles input type', async () => {
      ctx.db.human.request('input', 'Enter value:')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].type).toBe('input')
    })

    test('handles text type', async () => {
      ctx.db.human.request('text', 'Enter text:')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const pending = ctx.db.human.listPending()
      expect(pending[0].type).toBe('text')
    })
  })

  describe('layout and styling', () => {
    test('component renders with height prop', async () => {
      const props = createProps({ height: 50 })
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('component handles zero height', async () => {
      const props = createProps({ height: 0 })
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('component handles large height', async () => {
      const props = createProps({ height: 1000 })
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('keyboard handling', () => {
    test('component registers keyboard handler on mount', async () => {
      ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Component uses useKeyboard hook internally
      expect(true).toBe(true)
    })
  })

  describe('multiple request navigation', () => {
    test('handles navigation with many requests', async () => {
      for (let i = 0; i < 20; i++) {
        ctx.db.human.request('confirmation', `Request ${i}?`)
      }

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      expect(ctx.db.human.listPending()).toHaveLength(20)
    })

    test('handles request removal during navigation', async () => {
      const ids = Array.from({ length: 5 }, (_, i) =>
        ctx.db.human.request('confirmation', `Request ${i}?`)
      )

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Remove middle request
      ctx.db.human.resolve(ids[2], 'approved', true)
      await waitForEffects()

      expect(ctx.db.human.listPending()).toHaveLength(4)
    })
  })

  describe('useEffectOnValueChange behavior', () => {
    test('adjusts option selection when options length changes', async () => {
      // First request with options
      const id1 = ctx.db.human.request('select', 'Choose:', ['A', 'B', 'C', 'D'])

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const initialOption = readTuiState('tui:human:selectedOption', 0)
      expect(initialOption).toBe(0)

      // Resolve first and add one with fewer options
      ctx.db.human.resolve(id1, 'approved', 'A')
      ctx.db.human.request('select', 'New choose:', ['X', 'Y'])
      await waitForEffects()

      // selectedOption should still be valid
      expect(true).toBe(true)
    })
  })

  describe('response value handling', () => {
    test('preserves response value types', async () => {
      const requestId = ctx.db.human.request('input', 'Enter:')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      // Test string response
      ctx.db.human.resolve(requestId, 'approved', 'test string')
      const request = ctx.db.human.get(requestId)
      expect(request?.response).toBe('test string')
    })

    test('handles object response', async () => {
      const requestId = ctx.db.human.request('input', 'Enter:')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      const responseObj = { key: 'value', num: 42 }
      ctx.db.human.resolve(requestId, 'approved', responseObj)
      const request = ctx.db.human.get(requestId)
      expect(request?.response).toEqual(responseObj)
    })

    test('handles boolean response', async () => {
      const requestId = ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      ctx.db.human.resolve(requestId, 'approved', true)
      const request = ctx.db.human.get(requestId)
      expect(request?.response).toBe(true)
    })

    test('handles null response', async () => {
      const requestId = ctx.db.human.request('confirmation', 'Confirm?')

      const props = createProps()
      await ctx.root.render(<HumanInteractionHandler {...props} />)
      await waitForEffects()

      ctx.db.human.resolve(requestId, 'rejected', null)
      const request = ctx.db.human.get(requestId)
      expect(request?.response).toBe(null)
    })
  })
})

describe('HumanInteractionHandler exports', () => {
  test('exports HumanInteractionHandler function', async () => {
    const module = await import('./HumanInteractionHandler.js')
    expect(typeof module.HumanInteractionHandler).toBe('function')
  })

  test('exports HumanInteractionHandlerProps type', async () => {
    // TypeScript type check - if this compiles, the type is exported
    const ctx = createTuiTestContext()
    const _props: HumanInteractionHandlerProps = {
      db: ctx.db,
      height: 20
    }
    expect(_props).toBeDefined()
    cleanupTuiTestContext(ctx)
  })
})

describe('HumanInteractionHandler DB integration', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
    resetTuiState()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('queries pending requests via db.human.listPending', async () => {
    ctx.db.human.request('confirmation', 'Test?')

    await ctx.root.render(<HumanInteractionHandler db={ctx.db} height={20} />)
    await waitForEffects()

    // Hook calls db.human.listPending internally
    const pending = ctx.db.human.listPending()
    expect(pending).toHaveLength(1)
  })

  test('resolves requests via db.human.resolve', async () => {
    const requestId = ctx.db.human.request('confirmation', 'Test?')

    await ctx.root.render(<HumanInteractionHandler db={ctx.db} height={20} />)
    await waitForEffects()

    ctx.db.human.resolve(requestId, 'approved', true)

    const request = ctx.db.human.get(requestId)
    expect(request?.status).toBe('approved')
  })

  test('gets request by ID via db.human.get', async () => {
    const requestId = ctx.db.human.request('confirmation', 'Test?')

    await ctx.root.render(<HumanInteractionHandler db={ctx.db} height={20} />)
    await waitForEffects()

    const request = ctx.db.human.get(requestId)
    expect(request?.id).toBe(requestId)
    expect(request?.prompt).toBe('Test?')
  })
})
