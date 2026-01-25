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

test.describe('Day 96: Concurrent Operations', () => {
  test('resize during scroll is stable', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('Line 1\n')
    terminal.write('Line 2\n')
    terminal.write('Line 3\n')
    await new Promise(r => setTimeout(r, 200))

    terminal.resize(60, 20)
    terminal.write('\x1b[A')
    terminal.write('\x1b[B')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('resize during typing is stable', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    const typingPromise = (async () => {
      for (let i = 0; i < 20; i++) {
        terminal.write('x')
        await new Promise(r => setTimeout(r, 50))
      }
    })()

    await new Promise(r => setTimeout(r, 100))
    terminal.resize(80, 30)
    await new Promise(r => setTimeout(r, 200))
    terminal.resize(120, 40)

    await typingPromise
    await new Promise(r => setTimeout(r, 200))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('multiple rapid resizes are handled', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    for (let i = 0; i < 10; i++) {
      terminal.resize(80 + i * 4, 30 + i)
      await new Promise(r => setTimeout(r, 50))
    }

    await new Promise(r => setTimeout(r, 500))

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
