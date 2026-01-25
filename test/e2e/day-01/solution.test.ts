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

test.describe('Day 01: Startup', () => {
  test('renders input prompt and status bar', async ({ terminal }) => {
    // Wait for TUI to initialize - look for the input prompt character ">"
    await expect(terminal.getByText('>')).toBeVisible()

    // Status bar should show help hint
    await expect(terminal.getByText('help')).toBeVisible()

    // Take snapshot of startup state
    await expect(terminal).toMatchSnapshot()
  })
})
