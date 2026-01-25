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
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('list the files in the current directory')

    // Should see list_dir tool being called
    await expect(terminal.getByText('list_dir', { full: true })).toBeVisible({ timeout: 30000 })

    // Should see common project files
    await expect(terminal.getByText('package.json', { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('lists specific directory', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('list the contents of the tui/src directory')

    await expect(terminal.getByText('list_dir', { full: true })).toBeVisible({ timeout: 30000 })
    // Should see zig files
    await expect(terminal.getByText(/\.zig|main|app/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('lists nested directory', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('what files are in tui/src/agent/tools?')

    await expect(terminal.getByText('list_dir', { full: true })).toBeVisible({ timeout: 30000 })
    // Should see tool files
    await expect(terminal.getByText(/bash|grep|read_file/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('handles nonexistent directory', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('list the directory /nonexistent-dir-xyz-123')

    await expect(terminal.getByText('list_dir', { full: true })).toBeVisible({ timeout: 30000 })
    // Should see error
    await expect(terminal.getByText(/not found|no such|error|does not exist/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('shows directories with trailing slash', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('list the tui directory and show me which entries are folders')

    await expect(terminal.getByText('list_dir', { full: true })).toBeVisible({ timeout: 30000 })
    // Should see src directory
    await expect(terminal.getByText('src', { full: true })).toBeVisible({ timeout: 30000 })
  })
})
