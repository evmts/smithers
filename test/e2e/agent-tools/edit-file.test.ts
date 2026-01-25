import { test, expect } from '@microsoft/tui-test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

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
    // Setup: Create test file with known content
    mkdirSync(path.dirname(testFile), { recursive: true })
    writeFileSync(testFile, 'Hello REPLACE_ME World\nSecond line\nThird line\n')
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit(`in the file ${testFile}, replace "REPLACE_ME" with "EDITED_TEXT"`)

    // Should see edit_file tool being called
    await expect(terminal.getByText('edit_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })

    // Should indicate success
    await expect(terminal.getByText(/edited|replaced|success|updated/gi, { full: true, strict: false })).toBeVisible({ timeout: 30000 })

    // Verify the edit was made
    await new Promise(r => setTimeout(r, 1000))
    const content = readFileSync(testFile, 'utf-8')
    if (!content.includes('EDITED_TEXT')) {
      throw new Error('Edit not applied: ' + content)
    }
    if (content.includes('REPLACE_ME')) {
      throw new Error('Original text still present')
    }
    try { unlinkSync(testFile) } catch {}
  })

  test('handles multiline replacement', async ({ terminal }) => {
    mkdirSync(path.dirname(testFile), { recursive: true })
    writeFileSync(testFile, 'function old() {\n  return 1;\n}\n')
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit(`in ${testFile}, replace the function "old" with a function called "new" that returns 2`)

    await expect(terminal.getByText('edit_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })
    await expect(terminal.getByText(/edited|replaced|success|updated/gi, { full: true, strict: false })).toBeVisible({ timeout: 30000 })

    await new Promise(r => setTimeout(r, 1000))
    const content = readFileSync(testFile, 'utf-8')
    if (!content.includes('new') || !content.includes('2')) {
      throw new Error('Multiline edit failed: ' + content)
    }
    try { unlinkSync(testFile) } catch {}
  })

  test('reports error when old_str not found', async ({ terminal }) => {
    mkdirSync(path.dirname(testFile), { recursive: true })
    writeFileSync(testFile, 'some content\n')
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit(`in ${testFile}, replace "NONEXISTENT_STRING_XYZ" with "something"`)

    await expect(terminal.getByText('edit_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })
    // Should see error about string not found
    await expect(terminal.getByText(/not found|no match|error|couldn't find/gi, { full: true, strict: false })).toBeVisible({ timeout: 30000 })
    try { unlinkSync(testFile) } catch {}
  })
})
