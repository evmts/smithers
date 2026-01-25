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

test.describe('Day 07: Line Start with Ctrl+A', () => {
  test('Ctrl+A moves cursor to line start then type prepends', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('world')
    await expect(terminal.getByText('world')).toBeVisible()
    await terminal.write('\x01') // Ctrl+A - move to start
    await terminal.write('hello ')
    await expect(terminal.getByText('hello world')).toBeVisible()
  })
})
