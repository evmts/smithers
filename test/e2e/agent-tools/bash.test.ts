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

test.describe('Agent Tool: bash', () => {
  test('executes simple command and shows output', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('run the command "echo hello-from-bash-tool" and show me the output')

    // Wait for tool execution - should see bash tool being called
    await expect(terminal.getByText('bash', { full: true })).toBeVisible({ timeout: 30000 })

    // Should see the output
    await expect(terminal.getByText('hello-from-bash-tool', { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('executes command with pipes', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('use bash to run: echo "line1\\nline2\\nline3" | wc -l')

    await expect(terminal.getByText('bash', { full: true })).toBeVisible({ timeout: 30000 })
    // Should see line count (3)
    await expect(terminal.getByText('3', { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('handles command errors gracefully', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('run the bash command: ls /nonexistent-directory-12345')

    await expect(terminal.getByText('bash', { full: true })).toBeVisible({ timeout: 30000 })
    // Should see error indication
    await expect(terminal.getByText(/no such file|not found|error/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('executes pwd to show current directory', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('what is the current working directory? use pwd')

    await expect(terminal.getByText('bash', { full: true })).toBeVisible({ timeout: 30000 })
    // Should see a path
    await expect(terminal.getByText('/', { full: true })).toBeVisible({ timeout: 30000 })
  })
})
