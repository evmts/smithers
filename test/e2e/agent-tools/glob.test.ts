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

test.describe('Agent Tool: glob', () => {
  test('finds files with simple pattern', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the glob tool with pattern "*.json"')

    await expect(terminal.getByText('glob', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('finds files with recursive pattern', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the glob tool with pattern "tui/src/**/*.zig"')

    await expect(terminal.getByText('glob', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('finds test files pattern', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the glob tool with pattern "tui/**/*_test.zig"')

    await expect(terminal.getByText('glob', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('handles pattern with no matches', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the glob tool with pattern "*.xyz123nonexistent"')

    await expect(terminal.getByText('glob', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('finds markdown files', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the glob tool with pattern "*.md"')

    await expect(terminal.getByText('glob', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })
})
