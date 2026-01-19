import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

export const DEFAULT_MAIN_FILE = '.smithers/main.tsx'
export const DEFAULT_DB_DIR = '.smithers/data'
export const DB_FILE_NAME = 'smithers.db'

export function resolveEntrypoint(
  fileArg?: string,
  optionFile?: string,
  defaultFile: string = DEFAULT_MAIN_FILE
): string {
  return path.resolve(fileArg || optionFile || defaultFile)
}

export function ensureExecutable(filePath: string): void {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
  } catch {
    fs.chmodSync(filePath, '755')
  }
}

export function findPreloadPath(importMetaUrl: string): string {
  const startDir = path.dirname(fileURLToPath(importMetaUrl))
  const preloadPath = findUp(startDir, 'preload.ts')
  if (!preloadPath) {
    throw new Error('Could not find preload.ts - smithers-orchestrator may be incorrectly installed')
  }
  return preloadPath
}

export function findPackageRoot(importMetaUrl: string): string {
  const startDir = path.dirname(fileURLToPath(importMetaUrl))
  const packageJsonPath = findUp(startDir, 'package.json')
  return packageJsonPath ? path.dirname(packageJsonPath) : startDir
}

export function resolveDbPaths(
  inputPath?: string,
  defaultPath: string = DEFAULT_DB_DIR
): { requestedPath: string; dbFile: string } {
  const requestedPath = inputPath || defaultPath
  const dbFile = requestedPath.endsWith('.db')
    ? requestedPath
    : path.join(requestedPath, DB_FILE_NAME)
  return { requestedPath, dbFile }
}

function findUp(startDir: string, filename: string): string | null {
  let dir = startDir
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, filename)
    if (fs.existsSync(candidate)) {
      return candidate
    }
    dir = path.dirname(dir)
  }
  return null
}
