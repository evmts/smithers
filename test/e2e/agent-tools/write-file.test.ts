import { test, expect } from '@microsoft/tui-test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync, readFileSync } from 'node:fs'

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
    // Cleanup any existing test file
    try { unlinkSync(testFile) } catch {}
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit(`create a file at ${testFile} with the content "WRITE_FILE_TEST_CONTENT_12345"`)

    // Should see write_file tool being called
    await expect(terminal.getByText('write_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })

    // Should indicate success
    await expect(terminal.getByText(/wrote|created|success/i, { full: true, strict: false })).toBeVisible({ timeout: 30000 })

    // Verify file was actually created
    await new Promise(r => setTimeout(r, 1000))
    const content = readFileSync(testFile, 'utf-8')
    if (!content.includes('WRITE_FILE_TEST_CONTENT_12345')) {
      throw new Error('File content mismatch')
    }
    try { unlinkSync(testFile) } catch {}
  })

  test('creates file with multiline content', async ({ terminal }) => {
    try { unlinkSync(testFile) } catch {}
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit(`write a file to ${testFile} with three lines: "line1", "line2", "line3"`)

    await expect(terminal.getByText('write_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })
    await expect(terminal.getByText(/wrote|created|success/i, { full: true, strict: false })).toBeVisible({ timeout: 30000 })

    await new Promise(r => setTimeout(r, 1000))
    const content = readFileSync(testFile, 'utf-8')
    if (!content.includes('line1') || !content.includes('line2')) {
      throw new Error('Multiline content missing')
    }
    try { unlinkSync(testFile) } catch {}
  })

  test('creates parent directories automatically', async ({ terminal }) => {
    const nestedFile = path.join(projectRoot, '.tui-test/nested/deep/test.txt')
    await expect(terminal.getByText('>')).toBeVisible({ timeout: 10000 }); //.toBeVisible({ timeout: 10000 })

    terminal.submit(`create a file at ${nestedFile} with content "nested file test"`)

    await expect(terminal.getByText('write_file', { full: true, strict: false })).toBeVisible({ timeout: 30000 })
    await expect(terminal.getByText(/wrote|created|success/i, { full: true, strict: false })).toBeVisible({ timeout: 30000 })

    // Cleanup
    try { unlinkSync(nestedFile) } catch {}
  })
})
