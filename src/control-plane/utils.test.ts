/**
 * Unit tests for control-plane/utils.ts
 * Tests utility functions for path derivation and DB lookups
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as path from 'path'
import * as fs from 'fs'
import { Database } from 'bun:sqlite'
import { deriveDbPath, findDbForExecution } from './utils.js'

describe('deriveDbPath', () => {
  test('derives path for file in .smithers directory', () => {
    const cwd = '/home/user/project'
    const scriptPath = '/home/user/project/.smithers/main.tsx'
    const dbPath = deriveDbPath(scriptPath, cwd)
    
    expect(dbPath).toBe('/home/user/project/.smithers/data/.smithers-main.db')
  })

  test('derives path for file in subdirectory', () => {
    const cwd = '/home/user/project'
    const scriptPath = '/home/user/project/.smithers/workflows/deploy.tsx'
    const dbPath = deriveDbPath(scriptPath, cwd)
    
    expect(dbPath).toBe('/home/user/project/.smithers/data/.smithers-workflows-deploy.db')
  })

  test('derives path for file in cwd root', () => {
    const cwd = '/home/user/project'
    const scriptPath = '/home/user/project/workflow.tsx'
    const dbPath = deriveDbPath(scriptPath, cwd)
    
    expect(dbPath).toBe('/home/user/project/.smithers/data/workflow.db')
  })

  test('replaces path separators with dashes in filename', () => {
    const cwd = '/home/user/project'
    const scriptPath = '/home/user/project/a/b/c/script.tsx'
    const dbPath = deriveDbPath(scriptPath, cwd)
    
    expect(dbPath).toBe('/home/user/project/.smithers/data/a-b-c-script.db')
    const filename = path.basename(dbPath)
    expect(filename).toBe('a-b-c-script.db')
  })

  test('changes .tsx extension to .db', () => {
    const cwd = '/tmp'
    const scriptPath = '/tmp/test.tsx'
    const dbPath = deriveDbPath(scriptPath, cwd)
    
    expect(dbPath).toEndWith('.db')
    expect(dbPath).not.toContain('.tsx')
  })
})

describe('findDbForExecution', () => {
  let tempDir: string
  let smithersDir: string
  let dataDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tui-test', 'utils-test-'))
    smithersDir = path.join(tempDir, '.smithers')
    dataDir = path.join(smithersDir, 'data')
    fs.mkdirSync(dataDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('returns null when no DB files exist', () => {
    const result = findDbForExecution('exec-123', smithersDir)
    expect(result).toBeNull()
  })

  test('returns null when execution ID not found', () => {
    const dbPath = path.join(dataDir, 'test.db')
    const db = new Database(dbPath)
    db.run('CREATE TABLE executions (id TEXT PRIMARY KEY, status TEXT)')
    db.run("INSERT INTO executions (id, status) VALUES ('other-id', 'complete')")
    db.close()

    const result = findDbForExecution('exec-123', smithersDir)
    expect(result).toBeNull()
  })

  test('finds DB containing execution ID', () => {
    const dbPath = path.join(dataDir, 'test.db')
    const db = new Database(dbPath)
    db.run('CREATE TABLE executions (id TEXT PRIMARY KEY, status TEXT)')
    db.run("INSERT INTO executions (id, status) VALUES ('exec-123', 'running')")
    db.close()

    const result = findDbForExecution('exec-123', smithersDir)
    expect(result).toBe(dbPath)
  })

  test('searches multiple DB files', () => {
    const db1Path = path.join(dataDir, 'first.db')
    const db1 = new Database(db1Path)
    db1.run('CREATE TABLE executions (id TEXT PRIMARY KEY, status TEXT)')
    db1.run("INSERT INTO executions (id, status) VALUES ('other-id', 'complete')")
    db1.close()

    const db2Path = path.join(dataDir, 'second.db')
    const db2 = new Database(db2Path)
    db2.run('CREATE TABLE executions (id TEXT PRIMARY KEY, status TEXT)')
    db2.run("INSERT INTO executions (id, status) VALUES ('target-id', 'running')")
    db2.close()

    const result = findDbForExecution('target-id', smithersDir)
    expect(result).toBe(db2Path)
  })

  test('handles corrupted DB files gracefully', () => {
    fs.writeFileSync(path.join(dataDir, 'corrupt.db'), 'not a valid sqlite file')

    const validDbPath = path.join(dataDir, 'valid.db')
    const db = new Database(validDbPath)
    db.run('CREATE TABLE executions (id TEXT PRIMARY KEY, status TEXT)')
    db.run("INSERT INTO executions (id, status) VALUES ('exec-123', 'complete')")
    db.close()

    const result = findDbForExecution('exec-123', smithersDir)
    expect(result).toBe(validDbPath)
  })
})
