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

test.describe('Day 10: Word Nav with Alt+B', () => {
  test('Alt+B moves cursor back one word then type inserts', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('hello world')
    await expect(terminal.getByText('hello world')).toBeVisible()
    await terminal.write('\x1bb') // Alt+B - move word left
    await terminal.write('big ')
    await expect(terminal.getByText('hello big world')).toBeVisible()
  })
})
