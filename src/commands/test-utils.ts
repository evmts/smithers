import * as fs from 'fs'
import * as path from 'path'

export function createTempDir(baseDir: string, prefix: string): string {
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const tmpDir = path.join(baseDir, name)
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

export function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
