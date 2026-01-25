import { test, expect } from '@microsoft/tui-test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, unlinkSync, readFileSync, mkdirSync } from 'node:fs'

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
const testDir = path.join(projectRoot, '.tui-test/integration')

test.use({
  program: { file: tuiBinary },
  rows: 50,
  columns: 140,
})

test.describe('Agent Multi-Tool Integration', () => {
  test.beforeAll(() => {
    mkdirSync(testDir, { recursive: true })
  })

  test('uses multiple tools to complete a task', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Task requiring list_dir + read_file
    terminal.submit('list the files in tui/src/agent/tools and read the first 10 lines of bash.zig')

    // Should see both tools
    await expect(terminal.getByText('list_dir', { full: true })).toBeVisible({ timeout: 45000 })
    await expect(terminal.getByText('read_file', { full: true })).toBeVisible({ timeout: 45000 })

    // Should see content from bash.zig
    await expect(terminal.getByText(/std|import|bash/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('chains grep then read_file', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('find where "pub fn deinit" is defined in tui/src/app.zig and show me that function')

    // Should use grep to find, then read to show
    await expect(terminal.getByText(/grep|read_file/i, { full: true })).toBeVisible({ timeout: 45000 })

    // Should show deinit function
    await expect(terminal.getByText('deinit', { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('creates file then verifies with read', async ({ terminal }) => {
    const testFile = path.join(testDir, 'verify-test.txt')
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit(`create a file at ${testFile} with "INTEGRATION_TEST_123", then read it back to confirm`)

    // Should see write then read
    await expect(terminal.getByText('write_file', { full: true })).toBeVisible({ timeout: 45000 })
    await expect(terminal.getByText('read_file', { full: true })).toBeVisible({ timeout: 45000 })

    // Should confirm content
    await expect(terminal.getByText('INTEGRATION_TEST_123', { full: true })).toBeVisible({ timeout: 30000 })

    // Cleanup
    try { unlinkSync(testFile) } catch {}
  })

  test('analyzes codebase structure', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('analyze the tui/src directory structure - list main directories and count zig files')

    // Should use list_dir and possibly glob/bash
    await expect(terminal.getByText(/list_dir|glob|bash/i, { full: true })).toBeVisible({ timeout: 45000 })

    // Should report on structure
    await expect(terminal.getByText(/agent|components|keys|zig/i, { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('error recovery across tools', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('try to read /nonexistent-file.txt, if that fails, list the current directory instead')

    // Should try read_file first
    await expect(terminal.getByText('read_file', { full: true })).toBeVisible({ timeout: 45000 })

    // Should fall back to list_dir
    await expect(terminal.getByText('list_dir', { full: true })).toBeVisible({ timeout: 45000 })

    // Should show directory contents
    await expect(terminal.getByText(/package\.json|README/i, { full: true })).toBeVisible({ timeout: 30000 })
  })
})

test.describe('Agent Tool Streaming', () => {
  test('shows streaming output for long bash command', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit('run "find tui/src -name *.zig | head -20" and show all results')

    await expect(terminal.getByText('bash', { full: true })).toBeVisible({ timeout: 30000 })

    // Should see multiple .zig files as they stream
    await expect(terminal.getByText('.zig', { full: true })).toBeVisible({ timeout: 30000 })
  })

  test('handles tool cancellation', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // Start a potentially long operation
    terminal.submit('run "sleep 10 && echo done"')

    // Wait for tool to start
    await expect(terminal.getByText('bash', { full: true })).toBeVisible({ timeout: 15000 })

    // Cancel with Escape
    terminal.keyEscape()

    // Should see interruption
    await expect(terminal.getByText(/interrupt|cancel|stop/i, { full: true })).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Agent Context Awareness', () => {
  test('maintains context across tool calls', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // First message - establish context
    terminal.submit('read tui/src/main.zig and remember what modules it imports')

    await expect(terminal.getByText('read_file', { full: true })).toBeVisible({ timeout: 30000 })

    // Wait for response
    await new Promise(r => setTimeout(r, 5000))

    // Follow-up using context
    terminal.submit('now find where app_mod is defined')

    // Should search based on previous context
    await expect(terminal.getByText(/grep|read_file/i, { full: true })).toBeVisible({ timeout: 30000 })
    await expect(terminal.getByText('app', { full: true })).toBeVisible({ timeout: 30000 })
  })
})
