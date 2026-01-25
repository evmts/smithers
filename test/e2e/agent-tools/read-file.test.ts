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

test.describe('Agent Tool: read_file', () => {
  test('reads package.json and shows content', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit('read the package.json file and tell me the package name')

    // Should see read_file tool being called
    await expect(terminal.getByText('read_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })

    // Should see the package name from package.json
    await expect(terminal.getByText('smithers', { full: true, strict: false })).toBeVisible({ timeout: 30000 })
  })

  test('reads file with line range', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit('read the first 5 lines of README.md')

    await expect(terminal.getByText('read_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })
    // Should see some content from README
    await expect(terminal.getByText(/README|Smithers|#/i, { full: true, strict: false })).toBeVisible({ timeout: 30000 })
  })

  test('handles nonexistent file gracefully', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit('read the file /nonexistent-file-xyz-123.txt')

    await expect(terminal.getByText('read_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })
    // Should see error
    await expect(terminal.getByText(/not found|no such|error|does not exist/i, { full: true, strict: false })).toBeVisible({ timeout: 30000 })
  })

  test('reads zig source file', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit('read tui/src/main.zig and tell me what it imports')

    await expect(terminal.getByText('read_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })
    // Should see imports from main.zig
    await expect(terminal.getByText(/import|std|vaxis/i, { full: true, strict: false })).toBeVisible({ timeout: 30000 })
  })
})
