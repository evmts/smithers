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

test.describe('Day 98: Special Characters', () => {
  test('handles null byte without crash', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('test')
    await new Promise(r => setTimeout(r, 100))
    terminal.write('\x00')
    await new Promise(r => setTimeout(r, 100))
    terminal.write('after')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles escape character without crash', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('before')
    await new Promise(r => setTimeout(r, 100))
    terminal.write('\x1b')
    await new Promise(r => setTimeout(r, 100))
    terminal.write('after')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles mixed special characters', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('start')
    await new Promise(r => setTimeout(r, 50))
    terminal.write('\x00')
    terminal.write('\x1b')
    terminal.write('\x07')
    terminal.write('\x08')
    await new Promise(r => setTimeout(r, 50))
    terminal.write('end')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles control characters mixed with text', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('Hello')
    terminal.write('\x00')
    terminal.write('World')
    terminal.write('\x1b')
    terminal.write('Test')
    terminal.write('\x07')
    terminal.write('End')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles bell and backspace characters', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('\x07\x07\x07')
    terminal.write('ABC')
    terminal.write('\x08\x08\x08')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
