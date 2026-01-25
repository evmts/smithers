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

test.describe('Day 26: /init Command', () => {
  test('/init initializes project', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.submit('/init')

    // Should show init message
    await expect(terminal.getByText(/init|initializ|project|created|setup/i)).toBeVisible()

    await expect(terminal).toMatchSnapshot()
  })
})
