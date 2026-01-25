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

test.describe('Day 09: Kill All with Ctrl+U', () => {
  test('Ctrl+U clears entire line', async ({ terminal }) => {
    await expect(terminal.getByText('>')).toBeVisible()
    await terminal.write('text to delete')
    await expect(terminal.getByText('text to delete')).toBeVisible()
    await terminal.write('\x15') // Ctrl+U - delete to start
    await expect(terminal.getByText('text to delete')).not.toBeVisible()
  })
})
