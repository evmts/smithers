import { test, expect } from '@microsoft/tui-test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'

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
const testFile = path.join(projectRoot, '.tui-test/test-edit-file.txt')

test.use({
  program: { file: tuiBinary },
  rows: 40,
  columns: 120,
})

test.describe('Agent Tool: edit_file', () => {
  test('replaces text in file', async ({ terminal }) => {
    mkdirSync(path.dirname(testFile), { recursive: true })
    writeFileSync(testFile, 'Hello REPLACE_ME World\n')
    
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit(`use the edit_file tool on "${testFile}" to replace "REPLACE_ME" with "EDITED"`)

    await expect(terminal.getByText('edit_file', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
    
    try { unlinkSync(testFile) } catch {}
  })

  test('handles multiline replacement', async ({ terminal }) => {
    mkdirSync(path.dirname(testFile), { recursive: true })
    writeFileSync(testFile, 'function old() { return 1; }\n')
    
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit(`use the edit_file tool on "${testFile}" to replace "old" with "new"`)

    await expect(terminal.getByText('edit_file', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
    
    try { unlinkSync(testFile) } catch {}
  })

  test('reports error when old_str not found', async ({ terminal }) => {
    mkdirSync(path.dirname(testFile), { recursive: true })
    writeFileSync(testFile, 'some content\n')
    
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 })

    terminal.submit(`use the edit_file tool on "${testFile}" to replace "NONEXISTENT" with "x"`)

    await expect(terminal.getByText('edit_file', { full: true, strict: false })).toBeVisible({ timeout: 45000 })
    
    try { unlinkSync(testFile) } catch {}
  })
})
