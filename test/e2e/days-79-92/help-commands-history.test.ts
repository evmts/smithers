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

test.describe('Days 79-82: Help Overlay', () => {
  test('Day 79: Help overlay appears on ? key', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Press ? to toggle help (per status.zig toggleHelp)
    await terminal.write('?')
    
    // Help should show keybinding info
    await expect(terminal.getByText('interrupt')).toBeVisible()
    
    await expect(terminal).toMatchSnapshot('day-79-help-visible')
  })

  test('Day 80: Help overlay dismisses on Escape', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Open help with ?
    await terminal.write('?')
    
    // Dismiss with Escape
    await terminal.keyEscape()
    
    // Help should be gone, back to normal view with prompt
    await expect(terminal.getByText('>')).toBeVisible()
    await expect(terminal).toMatchSnapshot('day-80-help-dismissed')
  })

  test('Day 81: Help content shows all shortcuts', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Open help
    await terminal.write('?')
    
    // Per status.zig help rows: Ctrl+K, Ctrl+U, Ctrl+W, Ctrl+Y, etc.
    await expect(terminal.getByText('yank')).toBeVisible()
    
    await expect(terminal).toMatchSnapshot('day-81-help-content')
  })

  test('Day 82: Help overlay scrolls with arrow keys', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Open help
    await terminal.write('?')
    
    // Press down arrow (help might support scrolling)
    await terminal.keyDown()
    
    await expect(terminal).toMatchSnapshot('day-82-help-scroll')
  })
})

test.describe('Days 83-88: Command Popup', () => {
  test('Day 83: Command popup appears on / key', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Type / to trigger command popup per command_popup.zig
    await terminal.write('/')
    
    // Popup should show available slash commands
    await expect(terminal).toMatchSnapshot('day-83-popup-visible')
  })

  test('Day 84: Command popup filters on input', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Type /ex to filter commands (e.g., /exit)
    await terminal.write('/ex')
    
    // Should filter to only matching commands
    await expect(terminal).toMatchSnapshot('day-84-popup-filtered')
  })

  test('Day 85: Command popup navigates down', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Open popup
    await terminal.write('/')
    
    // Navigate down
    await terminal.keyDown()
    
    // Selection should move (select_list.moveDown())
    await expect(terminal).toMatchSnapshot('day-85-popup-nav-down')
  })

  test('Day 86: Command popup navigates up', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Open popup
    await terminal.write('/')
    
    // Navigate down then up
    await terminal.keyDown()
    await terminal.keyUp()
    
    // Selection should return to first item
    await expect(terminal).toMatchSnapshot('day-86-popup-nav-up')
  })

  test('Day 87: Command popup executes on Enter', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Open popup and select a command
    await terminal.write('/')
    await terminal.keyDown()
    await terminal.submit()
    
    // Command should execute and popup close
    await expect(terminal).toMatchSnapshot('day-87-popup-execute')
  })

  test('Day 88: Command popup closes on Escape', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Open popup
    await terminal.write('/')
    
    // Close with Escape
    await terminal.keyEscape()
    
    // Popup should be gone
    await expect(terminal).toMatchSnapshot('day-88-popup-close')
  })
})

test.describe('Days 89-92: Input History', () => {
  test('Day 89: Up arrow recalls previous input', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Submit two items to history
    await terminal.write('first message')
    await terminal.submit()
    
    // Wait for prompt to return
    await expect(terminal.getByText('>')).toBeVisible()
    
    await terminal.write('second message')
    await terminal.submit()
    
    // Wait for prompt
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Press up to get last message
    await terminal.keyUp()
    
    await expect(terminal).toMatchSnapshot('day-89-history-up')
  })

  test('Day 90: Down arrow navigates history forward', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Submit items
    await terminal.write('aaa')
    await terminal.submit()
    await expect(terminal.getByText('>')).toBeVisible()
    
    await terminal.write('bbb')
    await terminal.submit()
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Navigate up twice, then down once
    await terminal.keyUp()
    await terminal.keyUp()
    await terminal.keyDown()
    
    await expect(terminal).toMatchSnapshot('day-90-history-down')
  })

  test('Day 91: History navigation stops at oldest entry', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Submit one item
    await terminal.write('only entry')
    await terminal.submit()
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Press up many times - should stop at oldest
    await terminal.keyUp()
    await terminal.keyUp()
    await terminal.keyUp()
    await terminal.keyUp()
    await terminal.keyUp()
    
    await expect(terminal).toMatchSnapshot('day-91-history-wrap')
  })

  test('Day 92: Editing recalled history creates new entry', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Submit an item
    await terminal.write('original')
    await terminal.submit()
    await expect(terminal.getByText('>')).toBeVisible()
    
    // Recall and edit
    await terminal.keyUp()
    await terminal.write(' edited')
    
    await expect(terminal).toMatchSnapshot('day-92-history-edit')
  })
})
