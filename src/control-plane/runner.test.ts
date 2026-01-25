/**
 * Unit tests for control-plane/runner.ts
 * Tests orchestration execution, resume, cancel, and workflow creation
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as path from 'path'
import * as fs from 'fs'
import { Database } from 'bun:sqlite'
import { run, resume, cancel, createWorkflow } from './runner.js'

describe('runner', () => {
  let tempDir: string
  let smithersDir: string
  let dataDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tui-test', 'runner-test-'))
    smithersDir = path.join(tempDir, '.smithers')
    dataDir = path.join(smithersDir, 'data')
    fs.mkdirSync(dataDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('run()', () => {
    test('returns RunResult with executionId, dbPath, and pid', async () => {
      const scriptPath = path.join(smithersDir, 'test.tsx')
      fs.writeFileSync(scriptPath, 'console.log("test")')

      const result = await run({ script: scriptPath, cwd: tempDir })

      expect(result.executionId).toBeDefined()
      expect(result.executionId).toMatch(/^exec-/)
      expect(result.dbPath).toContain('.db')
      expect(result.pid).toBeGreaterThan(0)
    })

    test('uses provided executionId', async () => {
      const scriptPath = path.join(smithersDir, 'test.tsx')
      fs.writeFileSync(scriptPath, 'console.log("test")')

      const result = await run({ script: scriptPath, executionId: 'my-custom-id', cwd: tempDir })

      expect(result.executionId).toBe('my-custom-id')
    })

    test('handles relative script paths', async () => {
      const scriptPath = path.join(smithersDir, 'workflow.tsx')
      fs.writeFileSync(scriptPath, 'console.log("test")')

      const result = await run({ script: '.smithers/workflow.tsx', cwd: tempDir })

      expect(result.executionId).toBeDefined()
    })

    test('creates data directory if missing', async () => {
      fs.rmSync(dataDir, { recursive: true, force: true })
      const scriptPath = path.join(smithersDir, 'test.tsx')
      fs.writeFileSync(scriptPath, 'console.log("test")')

      await run({ script: scriptPath, cwd: tempDir })

      expect(fs.existsSync(dataDir)).toBe(true)
    })
  })

  describe('resume()', () => {
    test('throws when no incomplete executions found', async () => {
      await expect(resume({ cwd: tempDir })).rejects.toThrow('No incomplete executions found')
    })

    test('throws when specific executionId not found', async () => {
      await expect(resume({ executionId: 'nonexistent', cwd: tempDir })).rejects.toThrow('Execution nonexistent not found')
    })

    test('resumes specific execution by ID', async () => {
      const dbPath = path.join(dataDir, 'test.db')
      const db = new Database(dbPath)
      db.run(`CREATE TABLE executions (
        id TEXT PRIMARY KEY,
        file_path TEXT,
        status TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`)
      
      const scriptPath = path.join(smithersDir, 'workflow.tsx')
      fs.writeFileSync(scriptPath, 'console.log("resume")')
      db.run("INSERT INTO executions (id, file_path, status) VALUES ('exec-123', ?, 'running')", [scriptPath])
      db.close()

      const result = await resume({ executionId: 'exec-123', cwd: tempDir })

      expect(result.executionId).toBe('exec-123')
    })

    test('finds latest incomplete execution when no ID specified', async () => {
      const dbPath = path.join(dataDir, 'test.db')
      const db = new Database(dbPath)
      db.run(`CREATE TABLE executions (
        id TEXT PRIMARY KEY,
        file_path TEXT,
        status TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`)
      
      const scriptPath = path.join(smithersDir, 'latest.tsx')
      fs.writeFileSync(scriptPath, 'console.log("latest")')
      db.run("INSERT INTO executions (id, file_path, status, created_at) VALUES ('old-exec', ?, 'completed', '2024-01-01T00:00:00Z')", [scriptPath])
      db.run("INSERT INTO executions (id, file_path, status, created_at) VALUES ('new-exec', ?, 'running', '2024-01-02T00:00:00Z')", [scriptPath])
      db.close()

      const result = await resume({ cwd: tempDir })

      expect(result.executionId).toBe('new-exec')
    })
  })

  describe('cancel()', () => {
    test('throws when execution not found', async () => {
      await expect(cancel({ executionId: 'nonexistent', cwd: tempDir })).rejects.toThrow('Execution nonexistent not found')
    })

    test('updates execution status to cancelled', async () => {
      const dbPath = path.join(dataDir, 'test.db')
      const db = new Database(dbPath)
      db.run(`CREATE TABLE executions (
        id TEXT PRIMARY KEY,
        file_path TEXT,
        status TEXT,
        completed_at TEXT
      )`)
      db.run("INSERT INTO executions (id, file_path, status) VALUES ('exec-to-cancel', '/path/script.tsx', 'running')")
      db.close()

      await cancel({ executionId: 'exec-to-cancel', cwd: tempDir })

      const db2 = new Database(dbPath, { readonly: true })
      const exec = db2.query<{ status: string }, [string]>("SELECT status FROM executions WHERE id = ?").get('exec-to-cancel')
      db2.close()

      expect(exec?.status).toBe('cancelled')
    })
  })

  describe('createWorkflow()', () => {
    test('creates workflow file', async () => {
      fs.mkdirSync(smithersDir, { recursive: true })
      
      const content = `import { SmithersProvider } from 'smithers'\nexport default () => <SmithersProvider />`
      const result = await createWorkflow({ name: 'my-workflow', content, cwd: tempDir })

      expect(result.created).toBe(true)
      expect(result.path).toContain('my-workflow.tsx')
      expect(fs.existsSync(result.path)).toBe(true)
    })

    test('rejects invalid workflow names', async () => {
      const result = await createWorkflow({ name: 'invalid name!', content: '', cwd: tempDir })

      expect(result.created).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('alphanumeric')
    })

    test('prevents overwriting existing file without overwrite flag', async () => {
      fs.mkdirSync(smithersDir, { recursive: true })
      const existingPath = path.join(smithersDir, 'existing.tsx')
      fs.writeFileSync(existingPath, 'original content')

      const result = await createWorkflow({ name: 'existing', content: 'new content', cwd: tempDir })

      expect(result.created).toBe(false)
      expect(result.errors?.[0]).toContain('already exists')
      expect(fs.readFileSync(existingPath, 'utf8')).toBe('original content')
    })

    test('allows overwriting with overwrite flag', async () => {
      fs.mkdirSync(smithersDir, { recursive: true })
      const existingPath = path.join(smithersDir, 'overwrite.tsx')
      fs.writeFileSync(existingPath, 'original')

      const result = await createWorkflow({ name: 'overwrite', content: 'console.log("new")', overwrite: true, cwd: tempDir })

      expect(result.created).toBe(true)
      expect(fs.readFileSync(existingPath, 'utf8')).toBe('console.log("new")')
    })

    test('accepts valid TypeScript syntax', async () => {
      fs.mkdirSync(smithersDir, { recursive: true })
      
      const validContent = 'export const x = 1'
      const result = await createWorkflow({ name: 'valid', content: validContent, cwd: tempDir })

      expect(result.created).toBe(true)
    })
  })
})
