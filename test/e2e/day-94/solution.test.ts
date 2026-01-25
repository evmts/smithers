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

test.describe('Day 94: Long Input', () => {
  test('handles 10KB text input without crash', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    const longText = 'A'.repeat(10 * 1024)
    terminal.write(longText)

    await new Promise(r => setTimeout(r, 1000))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles long input with special characters', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    const mixedText = 'Hello '.repeat(1000) + '🚀'.repeat(100)
    terminal.write(mixedText)

    await new Promise(r => setTimeout(r, 500))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('long input can be submitted', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    const text = 'Test message '.repeat(100)
    terminal.write(text)
    await new Promise(r => setTimeout(r, 300))

    terminal.submit()
    await new Promise(r => setTimeout(r, 500))

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
