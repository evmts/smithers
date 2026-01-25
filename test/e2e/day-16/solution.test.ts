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

test.describe('Day 16: Popup Dismiss', () => {
  test('escape key dismisses autocomplete popup', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.write('/')

    // Popup should be visible
    await expect(terminal.getByText('/help')).toBeVisible()

    await terminal.keyEscape()

    // Popup should be dismissed, but "/" still in input
    // The command suggestions should no longer be visible as a popup
    await expect(terminal).toMatchSnapshot()
  })
})
