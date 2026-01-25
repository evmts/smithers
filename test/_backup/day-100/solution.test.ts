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

test.describe('Day 100: Full Lifecycle', () => {
  test('complete TUI lifecycle - start, use, exit', async ({ terminal }) => {
    test.setTimeout(60000)

    await expect(terminal.getByText('>')).toBeVisible()
    await expect(terminal.getByText('help')).toBeVisible()

    terminal.write('Hello, this is a test message')
    await new Promise(r => setTimeout(r, 300))

    terminal.submit()
    await new Promise(r => setTimeout(r, 500))

    terminal.write('/help')
    await new Promise(r => setTimeout(r, 200))
    terminal.submit()
    await new Promise(r => setTimeout(r, 500))

    terminal.write('\x1b[A')
    await new Promise(r => setTimeout(r, 100))
    terminal.write('\x1b[B')
    await new Promise(r => setTimeout(r, 100))

    terminal.write('\x03')
    await new Promise(r => setTimeout(r, 500))

    await expect(terminal).toMatchSnapshot()
  })

  test('lifecycle with multiple interactions', async ({ terminal }) => {
    test.setTimeout(60000)

    await expect(terminal.getByText('>')).toBeVisible()

    const messages = [
      'First message',
      'Second message with more content',
      'Third message: testing edge cases',
    ]

    for (const msg of messages) {
      terminal.write(msg)
      await new Promise(r => setTimeout(r, 200))
      terminal.submit()
      await new Promise(r => setTimeout(r, 300))
    }

    terminal.write('/clear')
    terminal.submit()
    await new Promise(r => setTimeout(r, 300))

    await expect(terminal.getByText('>')).toBeVisible()

    terminal.resize(80, 24)
    await new Promise(r => setTimeout(r, 200))

    terminal.write('Final message after resize')
    terminal.submit()
    await new Promise(r => setTimeout(r, 300))

    terminal.write('\x03')
    await new Promise(r => setTimeout(r, 500))
  })

  test('lifecycle with error recovery', async ({ terminal }) => {
    test.setTimeout(60000)

    await expect(terminal.getByText('>')).toBeVisible()

    terminal.submit()
    await new Promise(r => setTimeout(r, 200))

    terminal.write('\x00\x1b\x07')
    await new Promise(r => setTimeout(r, 200))

    terminal.write('\x1b[31mColored\x1b[0m')
    await new Promise(r => setTimeout(r, 200))

    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('Recovery test - normal message')
    terminal.submit()
    await new Promise(r => setTimeout(r, 300))

    terminal.write('\x03')
    await new Promise(r => setTimeout(r, 500))
  })

  test('comprehensive feature coverage', async ({ terminal }) => {
    test.setTimeout(90000)

    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('A'.repeat(500))
    await new Promise(r => setTimeout(r, 200))
    terminal.submit()
    await new Promise(r => setTimeout(r, 300))

    for (let i = 0; i < 20; i++) {
      terminal.write(String.fromCharCode(97 + (i % 26)))
    }
    await new Promise(r => setTimeout(r, 200))

    for (let i = 0; i < 20; i++) {
      terminal.write('\x7f')
    }
    await new Promise(r => setTimeout(r, 200))

    terminal.write('Test with emoji 🚀 and unicode: 日本語')
    terminal.submit()
    await new Promise(r => setTimeout(r, 300))

    terminal.resize(100, 30)
    await new Promise(r => setTimeout(r, 200))

    terminal.write('\x1b[A')
    terminal.write('\x1b[B')
    terminal.write('\x1b[C')
    terminal.write('\x1b[D')
    await new Promise(r => setTimeout(r, 200))

    await expect(terminal.getByText('>')).toBeVisible()

    terminal.write('\x03')
    await new Promise(r => setTimeout(r, 500))
  })
})
