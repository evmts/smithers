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

test.describe('Day 11: Word Delete with Ctrl+W', () => {
  test('Ctrl+W deletes previous word', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('alpha987 beta654')
    await expect(terminal.getByText('alpha987 beta654')).toBeVisible()
    await terminal.write('\x17') // Ctrl+W - delete word backward
    await expect(terminal.getByText('beta654')).not.toBeVisible()
    await expect(terminal.getByText('alpha987')).toBeVisible()
  })
})
