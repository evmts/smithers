import { defineConfig } from '@microsoft/tui-test'
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

const projectRoot = findProjectRoot()
const tuiBinary = path.join(projectRoot, 'tui/zig-out/bin/smithers-tui')

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 2,
  trace: process.env.CI ? true : false,

  use: {
    program: { file: tuiBinary },
    rows: 40,
    columns: 120,
  },
})
