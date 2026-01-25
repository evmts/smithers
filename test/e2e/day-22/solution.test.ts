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

test.describe('Day 22: /diff Command', () => {
  test('/diff shows git diff or no changes message', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.submit('/diff')

    // Should show diff output or "no changes" message
    await expect(terminal.getByText(/diff|changes|modified|no changes|clean|unchanged/i)).toBeVisible()

    await expect(terminal).toMatchSnapshot()
  })
})
