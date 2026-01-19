/**
 * Tests for artifacts module - artifact tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createArtifactsModule } from './artifacts.js'

describe('ArtifactsModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        agent_id TEXT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        git_hash TEXT,
        git_commit TEXT,
        summary TEXT,
        line_count INTEGER,
        byte_size INTEGER,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
  }

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    setupSchema()
    currentExecutionId = null
  })

  afterEach(() => {
    db.close()
  })

  const createArtifacts = () => {
    return createArtifactsModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId
    })
  }

  describe('add', () => {
    test('creates artifact with all fields', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id = artifacts.add('test.ts', 'code', '/path/to/test.ts', 'agent-1', { key: 'value' })

      const artifact = db.queryOne<any>('SELECT * FROM artifacts WHERE id = ?', [id])
      expect(artifact).not.toBeNull()
      expect(artifact.name).toBe('test.ts')
      expect(artifact.type).toBe('code')
      expect(artifact.file_path).toBe('/path/to/test.ts')
      expect(artifact.agent_id).toBe('agent-1')
      expect(JSON.parse(artifact.metadata)).toEqual({ key: 'value' })
      expect(artifact.execution_id).toBe(currentExecutionId)
    })

    test('creates artifact with minimal fields', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id = artifacts.add('file.txt', 'file', '/path/to/file.txt')

      const artifact = db.queryOne<any>('SELECT * FROM artifacts WHERE id = ?', [id])
      expect(artifact).not.toBeNull()
      expect(artifact.agent_id).toBeNull()
      expect(JSON.parse(artifact.metadata)).toEqual({})
    })

    test('returns unique id', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const ids = new Set<string>()
      for (let i = 0; i < 50; i++) {
        ids.add(artifacts.add(`file${i}.txt`, 'file', `/path/${i}.txt`))
      }
      expect(ids.size).toBe(50)
    })

    test('stores metadata as JSON', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const metadata = { nested: { deep: { value: 123 } }, arr: [1, 2, 3] }
      const id = artifacts.add('test.txt', 'file', '/path', undefined, metadata)

      const artifact = db.queryOne<any>('SELECT metadata FROM artifacts WHERE id = ?', [id])
      expect(JSON.parse(artifact.metadata)).toEqual(metadata)
    })

    test('throws without active execution', () => {
      currentExecutionId = null
      const artifacts = createArtifacts()

      expect(() => artifacts.add('file.txt', 'file', '/path')).toThrow('No active execution')
    })

    test('handles empty name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id = artifacts.add('', 'file', '/path')
      const artifact = db.queryOne<any>('SELECT name FROM artifacts WHERE id = ?', [id])
      expect(artifact.name).toBe('')
    })

    test('handles empty file_path', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id = artifacts.add('file.txt', 'file', '')
      const artifact = db.queryOne<any>('SELECT file_path FROM artifacts WHERE id = ?', [id])
      expect(artifact.file_path).toBe('')
    })

    test('handles all artifact types', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const types = ['file', 'code', 'document', 'image', 'data'] as const
      for (const type of types) {
        const id = artifacts.add(`test.${type}`, type, `/path/to/${type}`)
        const artifact = db.queryOne<any>('SELECT type FROM artifacts WHERE id = ?', [id])
        expect(artifact.type).toBe(type)
      }
    })

    test('stores null agent_id when not provided', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id = artifacts.add('file.txt', 'file', '/path', undefined)
      const artifact = db.queryOne<any>('SELECT agent_id FROM artifacts WHERE id = ?', [id])
      expect(artifact.agent_id).toBeNull()
    })

    test('handles empty metadata object', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id = artifacts.add('file.txt', 'file', '/path', undefined, {})
      const artifact = db.queryOne<any>('SELECT metadata FROM artifacts WHERE id = ?', [id])
      expect(JSON.parse(artifact.metadata)).toEqual({})
    })

    test('handles unicode in name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id = artifacts.add('文件🎉.txt', 'file', '/path')
      const artifact = db.queryOne<any>('SELECT name FROM artifacts WHERE id = ?', [id])
      expect(artifact.name).toBe('文件🎉.txt')
    })

    test('handles unicode in file_path', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id = artifacts.add('file.txt', 'file', '/путь/到/файл.txt')
      const artifact = db.queryOne<any>('SELECT file_path FROM artifacts WHERE id = ?', [id])
      expect(artifact.file_path).toBe('/путь/到/файл.txt')
    })

    test('handles special characters in file_path', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const path = '/path/with spaces/and "quotes"/file.txt'
      const id = artifacts.add('file.txt', 'file', path)
      const artifact = db.queryOne<any>('SELECT file_path FROM artifacts WHERE id = ?', [id])
      expect(artifact.file_path).toBe(path)
    })

    test('is safe against SQL injection in name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const maliciousName = "'; DROP TABLE artifacts; --"
      const id = artifacts.add(maliciousName, 'file', '/path')
      
      const artifact = db.queryOne<any>('SELECT name FROM artifacts WHERE id = ?', [id])
      expect(artifact.name).toBe(maliciousName)
      
      const tableExists = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'")
      expect(tableExists).toHaveLength(1)
    })

    test('returns uuid when db is closed', () => {
      currentExecutionId = 'exec-1'
      const artifacts = createArtifacts()
      db.close()

      const id = artifacts.add('file.txt', 'file', '/path')
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })
  })

  describe('list', () => {
    test('returns artifacts for execution', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      artifacts.add('file1.txt', 'file', '/path/1')
      artifacts.add('file2.txt', 'code', '/path/2')
      artifacts.add('file3.txt', 'document', '/path/3')

      const list = artifacts.list(currentExecutionId)
      expect(list).toHaveLength(3)
    })

    test('returns empty array for non-existent execution', () => {
      const artifacts = createArtifacts()
      const list = artifacts.list('nonexistent')
      expect(list).toEqual([])
    })

    test('returns artifacts ordered by created_at', async () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const id1 = artifacts.add('first.txt', 'file', '/path/1')
      await new Promise(r => setTimeout(r, 10))
      const id2 = artifacts.add('second.txt', 'file', '/path/2')
      await new Promise(r => setTimeout(r, 10))
      const id3 = artifacts.add('third.txt', 'file', '/path/3')

      const list = artifacts.list(currentExecutionId)
      expect(list[0].id).toBe(id1)
      expect(list[1].id).toBe(id2)
      expect(list[2].id).toBe(id3)
    })

    test('parses metadata JSON correctly', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      artifacts.add('file.txt', 'file', '/path', undefined, { key: 'value', num: 123 })

      const list = artifacts.list(currentExecutionId)
      expect(list[0].metadata).toEqual({ key: 'value', num: 123 })
    })

    test('handles invalid metadata JSON gracefully', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      
      db.run(
        `INSERT INTO artifacts (id, execution_id, name, type, file_path, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        ['bad-id', currentExecutionId, 'file.txt', 'file', '/path', 'invalid json']
      )

      const artifacts = createArtifacts()
      const list = artifacts.list(currentExecutionId)
      expect(list[0].metadata).toEqual({})
    })

    test('returns empty array when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()
      artifacts.add('file.txt', 'file', '/path')
      db.close()

      expect(artifacts.list(currentExecutionId)).toEqual([])
    })

    test('filters by execution_id', () => {
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-1'])
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-2'])
      const artifacts = createArtifacts()

      currentExecutionId = 'exec-1'
      artifacts.add('file1.txt', 'file', '/path/1')
      
      currentExecutionId = 'exec-2'
      artifacts.add('file2.txt', 'file', '/path/2')
      artifacts.add('file3.txt', 'file', '/path/3')

      const list1 = artifacts.list('exec-1')
      const list2 = artifacts.list('exec-2')

      expect(list1).toHaveLength(1)
      expect(list2).toHaveLength(2)
    })

    test('converts created_at to Date object', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      artifacts.add('file.txt', 'file', '/path')

      const list = artifacts.list(currentExecutionId)
      expect(list[0].created_at).toBeInstanceOf(Date)
    })
  })
})
