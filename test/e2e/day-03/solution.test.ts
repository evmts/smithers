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

test.describe('Day 03: Exit via Ctrl+D', () => {
  test('exits when Ctrl+D pressed with empty input', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    const exitPromise = new Promise<number>((resolve) => {
      terminal.onExit(({ exitCode }) => resolve(exitCode))
    })
    
    terminal.keyCtrlD()
    
    const exitCode = await exitPromise
    expect(exitCode).toBe(0)
  })
})

test.describe('Day 03b: Exit via double Ctrl+C', () => {
  test('exits when Ctrl+C pressed twice with empty input', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    
    const exitPromise = new Promise<number>((resolve) => {
      terminal.onExit(({ exitCode }) => resolve(exitCode))
    })
    
    terminal.keyCtrlC()
    terminal.keyCtrlC()
    
    const exitCode = await exitPromise
    expect(exitCode).toBe(0)
  })
})
