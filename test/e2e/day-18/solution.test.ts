import { test, expect } from '@microsoft/tui-test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  while (dir !== '/') {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
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

test.describe('Day 18: /clear Command', () => {
  test('/clear clears chat history', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    // First send a message
    await terminal.submit('test message')

    // Wait for message to appear
    await expect(terminal.getByText('test message')).toBeVisible()

    // Clear the chat
    await terminal.submit('/clear')

    // Chat should be cleared - the test message should no longer be visible
    await expect(terminal.getByText('test message')).not.toBeVisible()
    await expect(terminal.getByText('>')).toBeVisible()

    await expect(terminal).toMatchSnapshot()
  })
})
