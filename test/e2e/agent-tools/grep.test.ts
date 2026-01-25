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

test.describe('Agent Tool: grep', () => {
  test('searches for pattern in codebase', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('search for "pub fn init" in tui/src/app.zig')

    // Should see grep tool being called
    await expect(terminal.getByText('grep', { full: true })).toBeVisible({ timeout: 30000 })

    // Should find the init function
    await expect(terminal.getByText(/init|App/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('searches with regex pattern', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('use grep to find all lines matching "const.*=.*@import" in tui/src/main.zig')

    await expect(terminal.getByText('grep', { full: true })).toBeVisible({ timeout: 30000 })
    // Should find imports
    await expect(terminal.getByText('@import', { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('searches in directory recursively', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('grep for "ToolResult" in the tui/src/agent directory')

    await expect(terminal.getByText('grep', { full: true })).toBeVisible({ timeout: 30000 })
    // Should find ToolResult references
    await expect(terminal.getByText('ToolResult', { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('handles no matches gracefully', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('search for "ZZZZNONEXISTENT_PATTERN_XYZ123" in tui/src/')

    await expect(terminal.getByText('grep', { full: true })).toBeVisible({ timeout: 30000 })
    // Should indicate no matches
    await expect(terminal.getByText(/no match|not found|0 matches|no results/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('searches case-insensitively when requested', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('case-insensitive grep for "allocator" in tui/src/app.zig')

    await expect(terminal.getByText('grep', { full: true })).toBeVisible({ timeout: 30000 })
    // Should find allocator references
    await expect(terminal.getByText(/alloc/i, { full: true })).toBeVisible({ timeout: 30000 })
  })
})
