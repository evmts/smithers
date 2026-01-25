import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

export function findProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  while (dir !== '/') {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return process.cwd()
}

export const projectRoot = findProjectRoot()
export const tuiBinary = path.join(projectRoot, 'tui/zig-out/bin/smithers-tui')

export async function waitForReady(terminal: { getByText: (text: string) => { toBeVisible: () => Promise<void> } }) {
  await terminal.getByText('>').toBeVisible()
}

export function sendCtrlKey(terminal: { write: (data: string) => void }, key: string) {
  const code = key.toLowerCase().charCodeAt(0) - 96 // 'a' -> 1, 'b' -> 2, etc.
  terminal.write(String.fromCharCode(code))
}
