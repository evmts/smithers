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
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('find all *.json files in the current directory')

    // Should see glob tool being called
    await expect(terminal.getByText('glob', { full: true })).toBeVisible({ timeout: 30000 })

    // Should find package.json
    await expect(terminal.getByText('package.json', { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('finds files with recursive pattern', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('find all *.zig files in tui/src using glob pattern **/*.zig')

    await expect(terminal.getByText('glob', { full: true })).toBeVisible({ timeout: 30000 })
    // Should find zig files
    await expect(terminal.getByText(/\.zig/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('finds test files pattern', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('glob for all *_test.zig files in tui/')

    await expect(terminal.getByText('glob', { full: true })).toBeVisible({ timeout: 30000 })
    // Should find test files
    await expect(terminal.getByText(/_test\.zig/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('handles pattern with no matches', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('glob for *.xyz123nonexistent files')

    await expect(terminal.getByText('glob', { full: true })).toBeVisible({ timeout: 30000 })
    // Should indicate no matches
    await expect(terminal.getByText(/no match|not found|0|empty/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('finds markdown files', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('find all markdown files (*.md) in the project root')

    await expect(terminal.getByText('glob', { full: true })).toBeVisible({ timeout: 30000 })
    // Should find README.md
    await expect(terminal.getByText(/README|\.md/i, { full: true })).toBeVisible({ timeout: 30000 })
  })
})
