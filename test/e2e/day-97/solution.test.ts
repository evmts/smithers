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

test.describe('Day 97: Memory Stress', () => {
  test('handles many messages without memory issues', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    const messageCount = 50

    for (let i = 0; i < messageCount; i++) {
      terminal.write(`Message ${i + 1}: Test content here`)
      await terminal.submit()
      await new Promise(r => setTimeout(r, 30))
    }

    await new Promise(r => setTimeout(r, 500))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles repeated input clear cycles', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    for (let i = 0; i < 30; i++) {
      terminal.write('Some text to type and delete')
      await new Promise(r => setTimeout(r, 10))

      for (let j = 0; j < 28; j++) {
        terminal.write('\x7f')
      }
      await new Promise(r => setTimeout(r, 10))
    }

    await new Promise(r => setTimeout(r, 500))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles large content with scrolling', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    for (let i = 0; i < 100; i++) {
      terminal.write(`Line ${i}: ${'content '.repeat(5)}\n`)
    }

    await new Promise(r => setTimeout(r, 300))

    for (let i = 0; i < 20; i++) {
      terminal.write('\x1b[A')
      await new Promise(r => setTimeout(r, 5))
    }

    for (let i = 0; i < 20; i++) {
      terminal.write('\x1b[B')
      await new Promise(r => setTimeout(r, 5))
    }

    await new Promise(r => setTimeout(r, 500))

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
