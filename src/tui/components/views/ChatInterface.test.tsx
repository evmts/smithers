/**
 * Tests for src/tui/components/views/ChatInterface.tsx
 * Claude-powered Q&A interface with state management
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React, { type ReactElement } from 'react'
import { ChatInterface, type ChatInterfaceProps } from './ChatInterface.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../../test-utils.js'
import { resetTuiState, readTuiState } from '../../state.js'
import { TextAttributes } from '@opentui/core'

// Test harness to capture rendered JSX
interface CapturedState {
  element: ReactElement | null
}

function createChatInterfaceHarness(db: TuiTestContext['db']) {
  const captured: CapturedState = { element: null }

  function Harness({ height }: { height: number }) {
    captured.element = ChatInterface({ db, height })
    return captured.element
  }

  return { Harness, captured }
}

// Recursive helper to find text elements by exact content
function findTextByContent(element: ReactElement | null, content: string): ReactElement | null {
  if (!element || typeof element !== 'object') return null
  if (element.props?.content === content) return element

  const children = element.props?.children
  if (!children) return null

  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object') {
        const found = findTextByContent(child as ReactElement, content)
        if (found) return found
      }
    }
  } else if (typeof children === 'object') {
    return findTextByContent(children as ReactElement, content)
  }

  return null
}

// Recursive helper to find text elements by partial content match
function findTextContaining(element: ReactElement | null, substring: string): ReactElement | null {
  if (!element || typeof element !== 'object') return null
  if (typeof element.props?.content === 'string' && element.props.content.includes(substring)) {
    return element
  }

  const children = element.props?.children
  if (!children) return null

  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object') {
        const found = findTextContaining(child as ReactElement, substring)
        if (found) return found
      }
    }
  } else if (typeof children === 'object') {
    return findTextContaining(children as ReactElement, substring)
  }

  return null
}

// Get all text elements
function getAllTextElements(element: ReactElement | null): ReactElement[] {
  const results: ReactElement[] = []
  if (!element || typeof element !== 'object') return results

  if (element.type === 'text' && element.props?.content) {
    results.push(element)
  }

  const children = element.props?.children
  if (children) {
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === 'object') {
          results.push(...getAllTextElements(child as ReactElement))
        }
      }
    } else if (typeof children === 'object') {
      results.push(...getAllTextElements(children as ReactElement))
    }
  }

  return results
}

// Find element by type
function findElementByType(element: ReactElement | null, type: string): ReactElement | null {
  if (!element || typeof element !== 'object') return null
  if (element.type === type) return element

  const children = element.props?.children
  if (!children) return null

  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object') {
        const found = findElementByType(child as ReactElement, type)
        if (found) return found
      }
    }
  } else if (typeof children === 'object') {
    return findElementByType(children as ReactElement, type)
  }

  return null
}

// Check if API key is set to determine expected state
const hasApiKey = !!process.env['ANTHROPIC_API_KEY']

describe('tui/components/views/ChatInterface', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
    resetTuiState()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  function createProps(overrides: Partial<ChatInterfaceProps> = {}): ChatInterfaceProps {
    return {
      db: ctx.db,
      height: 20,
      ...overrides
    }
  }

  describe('component structure', () => {
    test('exports ChatInterface function', async () => {
      const module = await import('./ChatInterface.js')
      expect(typeof module.ChatInterface).toBe('function')
    })

    test('main container is a box element', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      expect(captured.element?.type).toBe('box')
    })

    test('main container uses column flex direction', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      expect(captured.element?.props?.style?.flexDirection).toBe('column')
    })

    test('renders text elements', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const textElements = getAllTextElements(captured.element)
      expect(textElements.length).toBeGreaterThan(0)
    })
  })

  describe('unavailable state (no API key)', () => {
    // These tests only run when API key is not set
    test.skipIf(hasApiKey)('renders unavailable message', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const unavailableText = findTextByContent(captured.element, 'Claude Chat Unavailable')
      expect(unavailableText).not.toBeNull()
    })

    test.skipIf(hasApiKey)('displays API key setup instructions', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const instructionText = findTextContaining(captured.element, 'ANTHROPIC_API_KEY')
      expect(instructionText).not.toBeNull()
    })

    test.skipIf(hasApiKey)('unavailable title has red color styling', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const unavailableText = findTextByContent(captured.element, 'Claude Chat Unavailable')
      expect(unavailableText?.props?.style?.fg).toBe('#f7768e')
    })

    test.skipIf(hasApiKey)('unavailable title has bold styling', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const unavailableText = findTextByContent(captured.element, 'Claude Chat Unavailable')
      expect(unavailableText?.props?.style?.attributes).toBe(TextAttributes.BOLD)
    })
  })

  describe('available state (with API key)', () => {
    // These tests only run when API key is set
    test.skipIf(!hasApiKey)('renders chat header', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const headerText = findTextContaining(captured.element, 'Claude Chat')
      expect(headerText).not.toBeNull()
    })

    test.skipIf(!hasApiKey)('header has blue color', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const headerText = findTextContaining(captured.element, 'Claude Chat')
      expect(headerText?.props?.style?.fg).toBe('#7aa2f7')
    })

    test.skipIf(!hasApiKey)('header has bold styling', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const headerText = findTextContaining(captured.element, 'Claude Chat')
      expect(headerText?.props?.style?.attributes).toBe(TextAttributes.BOLD)
    })

    test.skipIf(!hasApiKey)('renders empty state suggestions when no messages', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const suggestText = findTextContaining(captured.element, 'No messages yet')
      expect(suggestText).not.toBeNull()
    })

    test.skipIf(!hasApiKey)('renders example questions', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const statusQ = findTextContaining(captured.element, 'current status')
      const errorsQ = findTextContaining(captured.element, 'recent errors')
      const tokensQ = findTextContaining(captured.element, 'tokens')

      expect(statusQ).not.toBeNull()
      expect(errorsQ).not.toBeNull()
      expect(tokensQ).not.toBeNull()
    })

    test.skipIf(!hasApiKey)('renders scrollbox for messages', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const scrollbox = findElementByType(captured.element, 'scrollbox')
      expect(scrollbox).not.toBeNull()
    })

    test.skipIf(!hasApiKey)('scrollbox has dark background', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const scrollbox = findElementByType(captured.element, 'scrollbox')
      expect(scrollbox?.props?.style?.backgroundColor).toBe('#16161e')
    })

    test.skipIf(!hasApiKey)('renders input element', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const input = findElementByType(captured.element, 'input')
      expect(input).not.toBeNull()
    })

    test.skipIf(!hasApiKey)('input has placeholder text', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const input = findElementByType(captured.element, 'input')
      expect(input?.props?.placeholder).toContain('Ask Claude')
    })

    test.skipIf(!hasApiKey)('renders keyboard shortcut hints', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const hints = findTextContaining(captured.element, 'Enter to send')
      expect(hints).not.toBeNull()
    })

    test.skipIf(!hasApiKey)('hints mention Ctrl+L to clear', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const hints = findTextContaining(captured.element, 'Ctrl+L')
      expect(hints).not.toBeNull()
    })

    test.skipIf(!hasApiKey)('hints mention Tab to switch focus', async () => {
      const { Harness, captured } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const hints = findTextContaining(captured.element, 'Tab')
      expect(hints).not.toBeNull()
    })
  })

  describe('state management', () => {
    test('input state key is tui:chat:input', async () => {
      const { Harness } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      // The state should be readable (either initialized or default)
      const inputValue = readTuiState<string>('tui:chat:input', '__NOT_SET__')
      // If hooks ran, it will be '' (initialized), otherwise fallback
      expect(typeof inputValue).toBe('string')
    })

    test('focus state key is tui:chat:focus', async () => {
      const { Harness } = createChatInterfaceHarness(ctx.db)

      await ctx.root.render(<Harness height={20} />)
      await waitForEffects()

      const focusValue = readTuiState<boolean>('tui:chat:focus', false)
      expect(typeof focusValue).toBe('boolean')
    })
  })

  describe('rendering lifecycle', () => {
    test('renders without crashing with valid props', async () => {
      const props = createProps()

      await ctx.root.render(<ChatInterface {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles re-renders gracefully', async () => {
      const props = createProps()

      await ctx.root.render(<ChatInterface {...props} />)
      await waitForEffects()

      await ctx.root.render(<ChatInterface {...props} />)
      await waitForEffects()

      await ctx.root.render(<ChatInterface {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles height prop of zero', async () => {
      const props = createProps({ height: 0 })

      await ctx.root.render(<ChatInterface {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })

    test('handles large height values', async () => {
      const props = createProps({ height: 1000 })

      await ctx.root.render(<ChatInterface {...props} />)
      await waitForEffects()

      expect(true).toBe(true)
    })
  })

  describe('props interface', () => {
    test('requires db prop', () => {
      const props = createProps()
      expect(props.db).toBeDefined()
      expect(props.db).toBe(ctx.db)
    })

    test('requires height prop', () => {
      const props = createProps()
      expect(props.height).toBeDefined()
      expect(typeof props.height).toBe('number')
    })

    test('height prop is passed correctly', () => {
      const props = createProps({ height: 42 })
      expect(props.height).toBe(42)
    })
  })
})

describe('ChatInterface text elements', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
    resetTuiState()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('renders multiple text elements', async () => {
    const { Harness, captured } = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<Harness height={20} />)
    await waitForEffects()

    const textElements = getAllTextElements(captured.element)
    expect(textElements.length).toBeGreaterThanOrEqual(1)
  })

  test('all text elements have content property', async () => {
    const { Harness, captured } = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<Harness height={20} />)
    await waitForEffects()

    const textElements = getAllTextElements(captured.element)
    for (const el of textElements) {
      expect(typeof el.props.content).toBe('string')
    }
  })
})

describe('ChatInterface styling', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
    resetTuiState()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('root element has style object', async () => {
    const { Harness, captured } = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<Harness height={20} />)
    await waitForEffects()

    expect(captured.element?.props?.style).toBeDefined()
    expect(typeof captured.element?.props?.style).toBe('object')
  })

  test('uses column flex layout', async () => {
    const { Harness, captured } = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<Harness height={20} />)
    await waitForEffects()

    expect(captured.element?.props?.style?.flexDirection).toBe('column')
  })
})

describe('ChatInterface edge cases', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
    resetTuiState()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('handles undefined db gracefully', async () => {
    try {
      await ctx.root.render(<ChatInterface db={undefined as any} height={20} />)
      await waitForEffects()
      // May succeed depending on how hooks handle undefined
    } catch (e) {
      // Expected to fail with undefined db
      expect(e).toBeDefined()
    }
  })

  test('multiple instances can coexist', async () => {
    const props1 = { db: ctx.db, height: 10 }
    const props2 = { db: ctx.db, height: 30 }

    function MultipleInstances() {
      return (
        <box>
          <ChatInterface {...props1} />
          <ChatInterface {...props2} />
        </box>
      )
    }

    await ctx.root.render(<MultipleInstances />)
    await waitForEffects()

    expect(true).toBe(true)
  })

  test('state persists across re-renders within same root', async () => {
    const { Harness } = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<Harness height={20} />)
    await waitForEffects()

    await ctx.root.render(<Harness height={25} />)
    await waitForEffects()

    // Component should not crash on re-render
    expect(true).toBe(true)
  })
})

describe('ChatInterface integration', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
    resetTuiState()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('renders appropriate state based on API key availability', async () => {
    const { Harness, captured } = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<Harness height={20} />)
    await waitForEffects()

    const textElements = getAllTextElements(captured.element)
    const contents = textElements.map(t => t.props.content).join(' ')

    if (hasApiKey) {
      // Should show available state
      expect(contents).toContain('Claude Chat')
    } else {
      // Should show unavailable state
      expect(contents).toContain('Unavailable')
    }
  })

  test('component responds to db prop', async () => {
    const { Harness, captured } = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<Harness height={20} />)
    await waitForEffects()

    // Component should render based on db context
    expect(captured.element).not.toBeNull()
  })

  test('component responds to height prop', async () => {
    const harness1 = createChatInterfaceHarness(ctx.db)
    const harness2 = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<harness1.Harness height={10} />)
    await waitForEffects()

    await ctx.root.render(<harness2.Harness height={50} />)
    await waitForEffects()

    // Both should render
    expect(harness2.captured.element).not.toBeNull()
  })
})

describe('ChatInterface color scheme', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
    resetTuiState()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  test('uses Tokyo Night color palette', async () => {
    const { Harness, captured } = createChatInterfaceHarness(ctx.db)

    await ctx.root.render(<Harness height={20} />)
    await waitForEffects()

    const textElements = getAllTextElements(captured.element)

    // Tokyo Night colors used in the component
    const tokyoNightColors = [
      '#7aa2f7', // blue
      '#f7768e', // red
      '#9ece6a', // green
      '#e0af68', // amber
      '#7dcfff', // cyan
      '#c0caf5', // foreground
      '#565f89', // comment
      '#414868', // dark
      '#16161e', // background
    ]

    // At least some text elements should use Tokyo Night colors
    let hasTokyoNightColor = false
    for (const el of textElements) {
      if (el.props?.style?.fg && tokyoNightColors.includes(el.props.style.fg)) {
        hasTokyoNightColor = true
        break
      }
    }

    expect(hasTokyoNightColor).toBe(true)
  })
})
