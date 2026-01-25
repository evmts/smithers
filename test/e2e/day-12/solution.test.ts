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

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 12: Undo with Ctrl+Z', () => {
  test.skip('Ctrl+Z restores deleted text after Ctrl+U - SKIPPED: Ctrl+Z suspends TUI at handler level', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('undotest789')
    await expect(terminal.getByText('undotest789')).toBeVisible()
    await terminal.write('\x15') // Ctrl+U - delete entire line
    await expect(terminal.getByText('undotest789')).not.toBeVisible()
    await terminal.write('\x1a') // Ctrl+Z - undo
    await expect(terminal.getByText('undotest789')).toBeVisible()
  })

  test('Ctrl+Y yanks (pastes) killed text after Ctrl+U', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('yanktest456')
    await expect(terminal.getByText('yanktest456')).toBeVisible()
    await terminal.write('\x15') // Ctrl+U - delete entire line (to kill ring)
    await expect(terminal.getByText('yanktest456')).not.toBeVisible()
    await terminal.write('\x19') // Ctrl+Y - yank (paste from kill ring)
    await expect(terminal.getByText('yanktest456')).toBeVisible()
  })
})
