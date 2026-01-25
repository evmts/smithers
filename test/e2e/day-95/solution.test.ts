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

test.describe('Day 95: Rapid Keys', () => {
  test('handles 100 rapid key presses without crash', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    for (let i = 0; i < 100; i++) {
      terminal.write(String.fromCharCode(97 + (i % 26)))
    }

    await new Promise(r => setTimeout(r, 500))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles rapid arrow key navigation', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('Hello World')
    await new Promise(r => setTimeout(r, 100))

    for (let i = 0; i < 50; i++) {
      terminal.write('\x1b[D')
      terminal.write('\x1b[C')
    }

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles rapid mixed input', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    for (let i = 0; i < 50; i++) {
      terminal.write('a')
      terminal.write('\x7f')
    }

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
