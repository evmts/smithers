import { test, expect } from '@microsoft/tui-test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync, mkdirSync } from 'node:fs'

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  while (dir !== '/') {
    if (existsSync(path.join(dir, 'package.json'))) return dir
    dir = path.dirname(dir)
  }
  return process.cwd()
}

const projectRoot = findProjectRoot()
const tuiBinary = path.join(projectRoot, 'tui/zig-out/bin/smithers-tui')
const testFile = path.join(projectRoot, '.tui-test/test-write-output.txt')

test.use({
  program: { file: tuiBinary },
  rows: 40,
  columns: 120,
})

test.describe('Agent Tool: write_file', () => {
  test('creates new file with content', async ({ terminal }) => {
    try { unlinkSync(testFile) } catch {}
    mkdirSync(path.dirname(testFile), { recursive: true })
    
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit(`use the write_file tool to create "${testFile}" with content "TEST123"`)

    await expect(terminal.getByText('write_file', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
    
    try { unlinkSync(testFile) } catch {}
  })

  test('creates file with multiline content', async ({ terminal }) => {
    try { unlinkSync(testFile) } catch {}
    mkdirSync(path.dirname(testFile), { recursive: true })
    
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit(`use the write_file tool to write "line1\\nline2" to "${testFile}"`)

    await expect(terminal.getByText('write_file', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
    
    try { unlinkSync(testFile) } catch {}
  })
})
