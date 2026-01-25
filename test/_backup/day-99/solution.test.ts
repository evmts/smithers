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

test.describe('Day 99: ANSI Escape Sequences in Input', () => {
  test('handles CSI sequences in input', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('\x1b[31mRed Text\x1b[0m')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles cursor movement sequences', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('\x1b[10;20H')
    terminal.write('\x1b[2J')
    terminal.write('\x1b[K')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles malformed escape sequences', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('\x1b[')
    terminal.write('\x1b[999999m')
    terminal.write('\x1b[;m')
    terminal.write('\x1b[abc')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles OSC sequences', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('\x1b]0;Title\x07')
    terminal.write('\x1b]8;;https://example.com\x07Link\x1b]8;;\x07')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })

  test('handles mixed text and ANSI sequences', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('Normal \x1b[1mBold\x1b[0m Normal \x1b[4mUnderline\x1b[0m End')

    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()
  })
})
