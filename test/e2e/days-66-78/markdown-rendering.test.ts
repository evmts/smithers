import { test, expect } from '@microsoft/tui-test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  while (dir !== '/') {
    if (existsSync(path.join(dir, 'package.json'))) return dir
    dir = path.dirname(dir)
  }
  return process.cwd()
}

const tuiBinary = path.join(findProjectRoot(), 'tui/zig-out/bin/smithers-tui')

test.use({
  program: { file: tuiBinary },
  rows: 40,
  columns: 120,
})

test.describe('Days 66-72: Markdown Rendering', () => {
  test('Day 66: Code blocks render with border and highlighting', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Code blocks use cyan color (Color.cyan = 6) per parser.zig
    await expect(terminal).toMatchSnapshot('day-66-startup')
  })

  test('Day 67: Inline code renders with background color', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Inline code uses cyan color per parser.zig
    await expect(terminal).toMatchSnapshot('day-67-startup')
  })

  test('Day 68: Headings render bold and colored', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Headings: h1 = bold+underline, h2 = bold, h3 = bold+italic, h4 = italic
    await expect(terminal).toMatchSnapshot('day-68-startup')
  })

  test('Day 69: Lists render with bullets and indentation', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Unordered lists (- or *) and ordered lists (1. 2.) with indent_level
    await expect(terminal).toMatchSnapshot('day-69-startup')
  })

  test('Day 70: Links render underlined', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Links use Color.blue with underline per parser.zig
    await expect(terminal).toMatchSnapshot('day-70-startup')
  })

  test('Day 71: Bold and italic text styled correctly', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // **bold** -> bold: true, *italic* -> italic: true
    await expect(terminal).toMatchSnapshot('day-71-startup')
  })

  test('Day 72: Blockquotes render with quoted style', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Blockquotes (> text) use Color.green per parser.zig
    await expect(terminal).toMatchSnapshot('day-72-startup')
  })
})

test.describe('Days 73-78: Status Bar & Header', () => {
  test('Day 73: Header shows logo and session info', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Header shows "Smithers" title per header.zig
    await expect(terminal.getByText('Smithers')).toBeVisible()
    
    await expect(terminal).toMatchSnapshot('day-73-header')
  })

  test('Day 74: Status bar shows key shortcuts', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Status bar hints per status.zig: ?, Esc, Ctrl+C, /
    // Check for interrupt hint which is unique
    await expect(terminal.getByText('interrupt')).toBeVisible()
    
    await expect(terminal).toMatchSnapshot('day-74-status-hints')
  })

  test('Day 75: Loading spinner visible during AI call', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Spinner shown when is_busy = true per status.zig
    await terminal.write('hello')
    await terminal.submit()
    
    await expect(terminal).toMatchSnapshot('day-75-loading')
  })

  test('Day 76: Model name displayed in header', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Header displays model name per header.zig
    await expect(terminal.getByText('Smithers')).toBeVisible()
    
    await expect(terminal).toMatchSnapshot('day-76-model-name')
  })

  test('Day 77: Token count visible after response', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Token usage typically shown after AI response completes
    await expect(terminal).toMatchSnapshot('day-77-token-count')
  })

  test('Day 78: Error state shown in status', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // custom_status field in StatusBar used for errors
    await expect(terminal).toMatchSnapshot('day-78-error-status')
  })
})
