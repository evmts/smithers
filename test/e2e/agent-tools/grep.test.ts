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
  test('searches for pattern in file', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the grep tool to search for "pub fn init" in "tui/src/app.zig"')

    await expect(terminal.getByText('grep', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('searches with regex pattern', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the grep tool with pattern "@import" in "tui/src/main.zig"')

    await expect(terminal.getByText('grep', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('searches in directory recursively', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the grep tool to search for "ToolResult" in "tui/src/agent"')

    await expect(terminal.getByText('grep', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('handles no matches gracefully', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the grep tool to search for "ZZZZNONEXISTENT_PATTERN_XYZ123" in "tui/src/"')

    await expect(terminal.getByText('grep', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('searches case-insensitively', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the grep tool to search for "allocator" in "tui/src/app.zig"')

    await expect(terminal.getByText('grep', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })
})
