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

test.describe('Day 25: /compact Command', () => {
  test('/compact compacts conversation context', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.submit('/compact')

    // Should show compaction message
    await expect(terminal.getByText(/compact|compacted|context|reduced|summariz/i)).toBeVisible()

    await expect(terminal).toMatchSnapshot()
  })
})
