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

test.describe('Day 04: Text Entry', () => {
  test('typed text appears in input field', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('hello')
    await expect(terminal.getByText('hello')).toBeVisible()
  })

  test('multiple words appear correctly', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('hello world')
    await expect(terminal.getByText('hello world')).toBeVisible()
  })
})
