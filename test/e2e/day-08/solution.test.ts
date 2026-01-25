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

test.describe('Day 08: Kill Line with Ctrl+K', () => {
  test('Ctrl+K deletes from cursor to end of line', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('xkilltest123')
    await expect(terminal.getByText('xkilltest123')).toBeVisible()
    await terminal.write('\x01') // Ctrl+A - move to start  
    await terminal.write('\x0b') // Ctrl+K - kill entire line from start
    await expect(terminal.getByText('xkilltest123')).not.toBeVisible()
  })
})
