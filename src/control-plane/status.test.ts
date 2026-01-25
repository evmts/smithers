/**
 * Unit tests for control-plane/status.ts
 * Tests execution status retrieval and frame pagination
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as path from 'path'
import * as fs from 'fs'
import { Database } from 'bun:sqlite'
import { status, frames } from './status.js'

describe('status', () => {
  let tempDir: string
  let smithersDir: string
  let dataDir: string
  let dbPath: string
  let db: Database

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tui-test', 'status-test-'))
    smithersDir = path.join(tempDir, '.smithers')
    dataDir = path.join(smithersDir, 'data')
    fs.mkdirSync(dataDir, { recursive: true })
    dbPath = path.join(dataDir, 'test.db')
    
    db = new Database(dbPath)
    db.run(`CREATE TABLE executions (
      id TEXT PRIMARY KEY,
      file_path TEXT,
      status TEXT,
      total_iterations INTEGER,
      error TEXT
    )`)
    db.run(`CREATE TABLE phases (
      id TEXT PRIMARY KEY,
      execution_id TEXT,
      name TEXT,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`)
    db.run(`CREATE TABLE steps (
      id TEXT PRIMARY KEY,
      phase_id TEXT,
      name TEXT,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`)
    db.run(`CREATE TABLE render_frames (
      id TEXT PRIMARY KEY,
      execution_id TEXT,
      sequence_number INTEGER,
      tree_xml TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`)
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('status()', () => {
    test('throws when execution not found', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      
      expect(() => status('nonexistent', { cwd: tempDir })).toThrow('Execution nonexistent not found')
    })

    test('returns execution status', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 3)")
      
      const result = status('exec-1', { cwd: tempDir })
      
      expect(result.executionId).toBe('exec-1')
      expect(result.script).toBe('/path/main.tsx')
      expect(result.state).toBe('running')
      expect(result.iteration).toBe(3)
    })

    test('maps completed status to complete', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'completed', 1)")
      
      const result = status('exec-1', { cwd: tempDir })
      expect(result.state).toBe('complete')
    })

    test('maps cancelled status to failed', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'cancelled', 1)")
      
      const result = status('exec-1', { cwd: tempDir })
      expect(result.state).toBe('failed')
    })

    test('includes error when present', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations, error) VALUES ('exec-1', '/path/main.tsx', 'failed', 1, 'Something went wrong')")
      
      const result = status('exec-1', { cwd: tempDir })
      expect(result.error).toBe('Something went wrong')
    })

    test('includes phase tree', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      db.run("INSERT INTO phases (id, execution_id, name, status) VALUES ('phase-1', 'exec-1', 'Build', 'completed')")
      db.run("INSERT INTO phases (id, execution_id, name, status) VALUES ('phase-2', 'exec-1', 'Test', 'running')")
      
      const result = status('exec-1', { cwd: tempDir })
      
      expect(result.tree.phases.length).toBe(2)
      expect(result.tree.phases[0].name).toBe('Build')
      expect(result.tree.phases[0].status).toBe('complete')
      expect(result.tree.phases[1].name).toBe('Test')
      expect(result.tree.phases[1].status).toBe('running')
    })

    test('includes steps within phases', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      db.run("INSERT INTO phases (id, execution_id, name, status) VALUES ('phase-1', 'exec-1', 'Build', 'running')")
      db.run("INSERT INTO steps (id, phase_id, name, status) VALUES ('step-1', 'phase-1', 'Compile', 'completed')")
      db.run("INSERT INTO steps (id, phase_id, name, status) VALUES ('step-2', 'phase-1', 'Link', 'running')")
      
      const result = status('exec-1', { cwd: tempDir })
      
      const phase = result.tree.phases[0]
      expect(phase.children.length).toBe(2)
      expect(phase.children[0].name).toBe('Compile')
      expect(phase.children[0].status).toBe('complete')
      expect(phase.children[1].name).toBe('Link')
      expect(phase.children[1].status).toBe('running')
    })

    test('includes lastOutput from render frames', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      db.run("INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES ('frame-1', 'exec-1', 1, '<old />')")
      db.run("INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES ('frame-2', 'exec-1', 2, '<latest />')")
      
      const result = status('exec-1', { cwd: tempDir })
      expect(result.lastOutput).toBe('<latest />')
    })
  })

  describe('frames()', () => {
    test('throws when execution not found', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      
      expect(() => frames('nonexistent', { cwd: tempDir })).toThrow('Execution nonexistent not found')
    })

    test('returns frames for execution', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      db.run("INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, created_at) VALUES ('frame-1', 'exec-1', 1, '<first />', '2024-01-01T00:00:00Z')")
      db.run("INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, created_at) VALUES ('frame-2', 'exec-1', 2, '<second />', '2024-01-01T00:00:01Z')")
      
      const result = frames('exec-1', { cwd: tempDir })
      
      expect(result.frames.length).toBe(2)
      expect(result.frames[0].data).toBe('<first />')
      expect(result.frames[1].data).toBe('<second />')
    })

    test('returns cursor pointing to last frame', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      db.run("INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, created_at) VALUES ('frame-1', 'exec-1', 5, '<data />', '2024-01-01T00:00:00Z')")
      
      const result = frames('exec-1', { cwd: tempDir })
      expect(result.cursor).toBe(5)
    })

    test('filters frames by since cursor', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      db.run("INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, created_at) VALUES ('frame-1', 'exec-1', 1, '<first />', '2024-01-01T00:00:00Z')")
      db.run("INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, created_at) VALUES ('frame-2', 'exec-1', 2, '<second />', '2024-01-01T00:00:01Z')")
      db.run("INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, created_at) VALUES ('frame-3', 'exec-1', 3, '<third />', '2024-01-01T00:00:02Z')")
      
      const result = frames('exec-1', { cwd: tempDir, since: 1 })
      
      expect(result.frames.length).toBe(2)
      expect(result.frames[0].data).toBe('<second />')
      expect(result.frames[1].data).toBe('<third />')
    })

    test('respects limit', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      for (let i = 1; i <= 10; i++) {
        db.run(`INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, created_at) VALUES ('frame-${i}', 'exec-1', ${i}, '<data${i} />', '2024-01-01T00:00:0${i}Z')`)
      }
      
      const result = frames('exec-1', { cwd: tempDir, limit: 3 })
      
      expect(result.frames.length).toBe(3)
    })

    test('truncates long data', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      const longData = 'x'.repeat(10000)
      db.run(`INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, created_at) VALUES ('frame-1', 'exec-1', 1, '${longData}', '2024-01-01T00:00:00Z')`)
      
      const result = frames('exec-1', { cwd: tempDir, maxChars: 100 })
      
      expect(result.frames[0].data.length).toBeLessThan(200)
      expect(result.frames[0].data).toContain('truncated')
    })

    test('returns empty frames array when none exist', () => {
      db.run("INSERT INTO executions (id, file_path, status, total_iterations) VALUES ('exec-1', '/path/main.tsx', 'running', 1)")
      
      const result = frames('exec-1', { cwd: tempDir })
      
      expect(result.frames).toEqual([])
      expect(result.cursor).toBe(0)
    })
  })
})
