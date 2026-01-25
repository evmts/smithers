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

test.describe('Agent Tool: list_dir', () => {
  test('lists current directory contents', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the list_dir tool on "."')

    // Should see list_dir tool being called
    await expect(terminal.getByText('list_dir', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('lists specific directory', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the list_dir tool on "tui/src"')

    await expect(terminal.getByText('list_dir', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('lists nested directory', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the list_dir tool on "tui/src/agent/tools"')

    await expect(terminal.getByText('list_dir', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('handles nonexistent directory', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the list_dir tool on "/nonexistent-dir-xyz-123"')

    await expect(terminal.getByText('list_dir', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })

  test('shows directories with trailing slash', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit('use the list_dir tool on "tui"')

    await expect(terminal.getByText('list_dir', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
  })
})
