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

test.describe('Day 20: /model Command', () => {
  test('/model shows current model', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    await terminal.submit('/model')

    // Should display model name (claude, sonnet, opus, haiku, etc.)
    await expect(terminal.getByText(/claude|sonnet|opus|haiku|model|gpt/i)).toBeVisible()

    await expect(terminal).toMatchSnapshot()
  })
})
