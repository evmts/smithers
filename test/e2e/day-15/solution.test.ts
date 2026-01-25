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

test.describe('Day 15: Autocomplete Submit', () => {
  test('submitting partial command executes matched command', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.write('/he')
    await terminal.submit()

    // Help output should be visible
    await expect(terminal.getByText('help')).toBeVisible()
    await expect(terminal.getByText('exit')).toBeVisible()

    await expect(terminal).toMatchSnapshot()
  })
})
