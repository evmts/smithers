import { test, expect } from '@microsoft/tui-test'
import { tuiBinary } from '../helpers/smithers.js'

test.use({
  program: { file: tuiBinary },
  rows: 40,
  columns: 120,
})

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test.describe('Day 54: Screen Redraw', () => {
  test('Ctrl+L triggers clean redraw', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Type some text first
    await terminal.write('some input text')
    await expect(terminal).toMatchSnapshot('before-redraw')

    // Send Ctrl+L (form feed character)
    await terminal.write('\x0c')

    await delay(500)

    // Screen should be cleanly redrawn
    await expect(terminal).toMatchSnapshot('after-redraw')
  })
})

test.describe('Day 55: Terminal Resize', () => {
  test('adapts layout when resized', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await expect(terminal).toMatchSnapshot('initial-size')

    // Resize to smaller dimensions
    terminal.resize(80, 20)
    await delay(500)
    await expect(terminal).toMatchSnapshot('resized-80x20')

    // Resize back to larger
    terminal.resize(120, 40)
    await delay(500)
    await expect(terminal).toMatchSnapshot('resized-120x40')
  })
})

test.describe('Day 56: Minimum Size Handling', () => {
  test('handles very small terminal gracefully', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Resize to minimum practical size
    terminal.resize(40, 10)
    await delay(500)

    // Should still be usable or show graceful message
    await expect(terminal).toMatchSnapshot('minimum-size-40x10')

    // Try even smaller
    terminal.resize(30, 8)
    await delay(500)
    await expect(terminal).toMatchSnapshot('very-small-30x8')
  })
})

test.describe('Day 57: Large Terminal Size', () => {
  test('uses space efficiently in large terminal', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Resize to large dimensions
    terminal.resize(200, 60)
    await delay(500)
    await expect(terminal).toMatchSnapshot('large-size-200x60')

    // Submit a message to see how content fills space
    await terminal.submit('hello')
    await delay(2000)
    await expect(terminal).toMatchSnapshot('large-size-with-content')
  })
})

test.describe('Day 58: Unicode Rendering', () => {
  test('renders unicode and emoji correctly', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Test Japanese text
    await terminal.submit('こんにちは')
    await delay(2000)
    await expect(terminal).toMatchSnapshot('unicode-japanese')

    // Test emoji
    await terminal.submit('🎉 celebration time 🚀')
    await delay(2000)
    await expect(terminal).toMatchSnapshot('unicode-emoji')

    // Mixed unicode content
    await terminal.submit('Hello 世界 🌍 مرحبا')
    await delay(2000)
    await expect(terminal).toMatchSnapshot('unicode-mixed')
  })

  test('handles combining characters', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Test combining diacritics
    await terminal.submit('café résumé naïve')
    await delay(2000)
    await expect(terminal).toMatchSnapshot('unicode-combining')
  })
})
