/**
 * Tests for cli-utils
 * 
 * Covers: Path resolution, file permissions, database paths, package root detection
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import {
  DEFAULT_MAIN_FILE,
  DEFAULT_DB_DIR,
  DB_FILE_NAME,
  resolveEntrypoint,
  ensureExecutable,
  findPreloadPath,
  findPackageRoot,
  resolveDbPaths,
} from './cli-utils'
import { cleanupTempDir, createTempDir } from './test-utils'

describe('constants', () => {
  test('DEFAULT_MAIN_FILE is .smithers/main.tsx', () => {
    expect(DEFAULT_MAIN_FILE).toBe('.smithers/main.tsx')
  })

  test('DEFAULT_DB_DIR is .smithers/data', () => {
    expect(DEFAULT_DB_DIR).toBe('.smithers/data')
  })

  test('DB_FILE_NAME is smithers.db', () => {
    expect(DB_FILE_NAME).toBe('smithers.db')
  })
})

describe('resolveEntrypoint', () => {
  test('returns fileArg when provided', () => {
    const result = resolveEntrypoint('/path/to/file.tsx')
    expect(result).toBe('/path/to/file.tsx')
  })

  test('returns optionFile when fileArg not provided', () => {
    const result = resolveEntrypoint(undefined, '/option/file.tsx')
    expect(result).toBe('/option/file.tsx')
  })

  test('returns defaultFile when neither provided', () => {
    const result = resolveEntrypoint(undefined, undefined, '/default/file.tsx')
    expect(result).toBe('/default/file.tsx')
  })

  test('uses DEFAULT_MAIN_FILE as ultimate fallback', () => {
    const result = resolveEntrypoint()
    expect(result).toBe(path.resolve(DEFAULT_MAIN_FILE))
  })

  test('resolves relative paths to absolute', () => {
    const result = resolveEntrypoint('relative/path.tsx')
    expect(path.isAbsolute(result)).toBe(true)
  })

  test('fileArg takes precedence over optionFile', () => {
    const result = resolveEntrypoint('/fileArg.tsx', '/optionFile.tsx')
    expect(result).toBe('/fileArg.tsx')
  })

  test('optionFile takes precedence over defaultFile', () => {
    const result = resolveEntrypoint(undefined, '/optionFile.tsx', '/defaultFile.tsx')
    expect(result).toBe('/optionFile.tsx')
  })
})

describe('ensureExecutable', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir(import.meta.dir, '.test-executable')
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test('makes non-executable file executable', () => {
    const testFile = path.join(tempDir, 'test.tsx')
    fs.writeFileSync(testFile, '#!/usr/bin/env bun\n')
    fs.chmodSync(testFile, '644')

    ensureExecutable(testFile)

    const stats = fs.statSync(testFile)
    expect((stats.mode & 0o100) !== 0).toBe(true)
  })

  test('leaves already executable file unchanged', () => {
    const testFile = path.join(tempDir, 'exec.tsx')
    fs.writeFileSync(testFile, '#!/usr/bin/env bun\n')
    fs.chmodSync(testFile, '755')

    ensureExecutable(testFile)

    const stats = fs.statSync(testFile)
    expect((stats.mode & 0o755) !== 0).toBe(true)
  })

  test('sets mode 755', () => {
    const testFile = path.join(tempDir, 'mode.tsx')
    fs.writeFileSync(testFile, '#!/usr/bin/env bun\n')
    fs.chmodSync(testFile, '600')

    ensureExecutable(testFile)

    const stats = fs.statSync(testFile)
    expect((stats.mode & 0o100) !== 0).toBe(true)
  })
})

describe('findPreloadPath', () => {
  test('throws error when preload.ts not found', () => {
    const fakeUrl = 'file:///nonexistent/path/module.ts'
    expect(() => findPreloadPath(fakeUrl)).toThrow('preload.ts')
    expect(() => findPreloadPath(fakeUrl)).toThrow('smithers-orchestrator')
  })

  test('error message is descriptive', () => {
    try {
      findPreloadPath('file:///fake/path/module.ts')
    } catch (e) {
      expect(e instanceof Error).toBe(true)
      expect((e as Error).message).toContain('incorrectly installed')
    }
  })
})

describe('findPackageRoot', () => {
  test('finds package.json from this module location', () => {
    const result = findPackageRoot(import.meta.url)
    const packageJsonPath = path.join(result, 'package.json')
    expect(fs.existsSync(packageJsonPath)).toBe(true)
  })

  test('returns startDir when package.json not found', () => {
    const fakeUrl = 'file:///nonexistent/deep/path/module.ts'
    const result = findPackageRoot(fakeUrl)
    expect(result).toBe('/nonexistent/deep/path')
  })
})

describe('resolveDbPaths', () => {
  test('uses default path when input not provided', () => {
    const result = resolveDbPaths()
    expect(result.requestedPath).toBe(DEFAULT_DB_DIR)
    expect(result.dbFile).toBe(path.join(DEFAULT_DB_DIR, DB_FILE_NAME))
  })

  test('uses provided input path', () => {
    const result = resolveDbPaths('/custom/path')
    expect(result.requestedPath).toBe('/custom/path')
    expect(result.dbFile).toBe('/custom/path/smithers.db')
  })

  test('handles input path ending with .db', () => {
    const result = resolveDbPaths('/custom/mydb.db')
    expect(result.requestedPath).toBe('/custom/mydb.db')
    expect(result.dbFile).toBe('/custom/mydb.db')
  })

  test('appends DB_FILE_NAME to directory paths', () => {
    const result = resolveDbPaths('/some/directory')
    expect(result.dbFile).toBe('/some/directory/smithers.db')
  })

  test('uses custom default path when provided', () => {
    const result = resolveDbPaths(undefined, '/my/default')
    expect(result.requestedPath).toBe('/my/default')
    expect(result.dbFile).toBe('/my/default/smithers.db')
  })
})
