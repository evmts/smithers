import { test, expect } from '@microsoft/tui-test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  while (dir !== '/') {
    if (existsSync(path.join(dir, 'package.json'))) return dir
    dir = path.dirname(dir)
  }
  return process.cwd()
}

const tuiBinary = path.join(findProjectRoot(), 'tui/zig-out/bin/smithers-tui')

test.use({ program: { file: tuiBinary }, rows: 40, columns: 120 })

test.describe('Day 93: Empty Submit', () => {
  test('empty submit does nothing and does not crash', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit()

    await new Promise(r => setTimeout(r, 500))

    await expect(terminal.getByText('>')).toBeVisible()
    await expect(terminal).toMatchSnapshot()
  })

  test('multiple empty submits are handled gracefully', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    for (let i = 0; i < 5; i++) {
      terminal.submit()
      await new Promise(r => setTimeout(r, 100))
    }

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
