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

  const setActiveExecution = (id: string) => {
    db.run('INSERT INTO executions (id) VALUES (?)', [id])
    currentExecutionId = id
  }

  describe('Basic CRUD operations', () => {
    test('add creates artifact with all fields', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const metadata = { key: 'value', num: 42 }
      const id = artifacts.add('test-artifact', 'file', '/path/to/file.txt', 'agent-1', metadata)
      
      expect(id).toBeDefined()
      const rows = db.query<any>('SELECT * FROM artifacts WHERE id = ?', [id])
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe('test-artifact')
      expect(rows[0].type).toBe('file')
      expect(rows[0].file_path).toBe('/path/to/file.txt')
      expect(rows[0].agent_id).toBe('agent-1')
      expect(JSON.parse(rows[0].metadata)).toEqual(metadata)
    })

    test('add creates artifact with minimal fields', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('minimal', 'code', '/file.ts')
      
      const rows = db.query<any>('SELECT * FROM artifacts WHERE id = ?', [id])
      expect(rows).toHaveLength(1)
      expect(rows[0].agent_id).toBe(null)
      expect(JSON.parse(rows[0].metadata)).toEqual({})
    })

    test('add returns unique id', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const ids = new Set<string>()
      for (let i = 0; i < 10; i++) {
        ids.add(artifacts.add(`artifact-${i}`, 'file', `/path/${i}.txt`))
      }
      expect(ids.size).toBe(10)
    })

    test('add stores metadata as JSON', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const metadata = { nested: { deep: { value: 'test' } }, arr: [1, 2, 3] }
      const id = artifacts.add('test', 'file', '/path.txt', undefined, metadata)
      
      const rows = db.query<any>('SELECT metadata FROM artifacts WHERE id = ?', [id])
      expect(JSON.parse(rows[0].metadata)).toEqual(metadata)
    })

    test('list returns artifacts for execution', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      artifacts.add('artifact-1', 'file', '/path1.txt')
      artifacts.add('artifact-2', 'code', '/path2.ts')
      
      const result = artifacts.list('exec-1')
      expect(result).toHaveLength(2)
      expect(result.map(a => a.name)).toContain('artifact-1')
      expect(result.map(a => a.name)).toContain('artifact-2')
    })

    test('list returns empty array for non-existent execution', () => {
      const artifacts = createArtifacts()
      const result = artifacts.list('nonexistent')
      expect(result).toEqual([])
    })

    test('list returns artifacts ordered by created_at', async () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      artifacts.add('first', 'file', '/first.txt')
      await new Promise(r => setTimeout(r, 10))
      artifacts.add('second', 'file', '/second.txt')
      
      const result = artifacts.list('exec-1')
      expect(result[0].name).toBe('first')
      expect(result[1].name).toBe('second')
    })
  })

  describe('Error cases', () => {
    test('add throws without active execution', () => {
      const artifacts = createArtifacts()
      expect(() => artifacts.add('test', 'file', '/path.txt')).toThrow('No active execution')
    })

    test('add with empty name', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('', 'file', '/path.txt')
      const rows = db.query<any>('SELECT name FROM artifacts WHERE id = ?', [id])
      expect(rows[0].name).toBe('')
    })

    test('add with empty type', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', '' as any, '/path.txt')
      const rows = db.query<any>('SELECT type FROM artifacts WHERE id = ?', [id])
      expect(rows[0].type).toBe('')
    })

    test('add with empty file_path', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'file', '')
      const rows = db.query<any>('SELECT file_path FROM artifacts WHERE id = ?', [id])
      expect(rows[0].file_path).toBe('')
    })
  })

  describe('Agent relationship', () => {
    test('add with agent_id', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'file', '/path.txt', 'agent-123')
      const rows = db.query<any>('SELECT agent_id FROM artifacts WHERE id = ?', [id])
      expect(rows[0].agent_id).toBe('agent-123')
    })

    test('add without agent_id (null)', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'file', '/path.txt')
      const rows = db.query<any>('SELECT agent_id FROM artifacts WHERE id = ?', [id])
      expect(rows[0].agent_id).toBe(null)
    })
  })

  describe('Metadata handling', () => {
    test('add with empty metadata object', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'file', '/path.txt', undefined, {})
      const rows = db.query<any>('SELECT metadata FROM artifacts WHERE id = ?', [id])
      expect(JSON.parse(rows[0].metadata)).toEqual({})
    })

    test('add with complex nested metadata', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const metadata = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
              array: [1, 2, { nested: true }]
            }
          }
        }
      }
      const id = artifacts.add('test', 'file', '/path.txt', undefined, metadata)
      const rows = db.query<any>('SELECT metadata FROM artifacts WHERE id = ?', [id])
      expect(JSON.parse(rows[0].metadata)).toEqual(metadata)
    })

    test('add with metadata containing special characters', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const metadata = { special: 'quotes"and\\backslash\ttab\nnewline' }
      const id = artifacts.add('test', 'file', '/path.txt', undefined, metadata)
      const rows = db.query<any>('SELECT metadata FROM artifacts WHERE id = ?', [id])
      expect(JSON.parse(rows[0].metadata)).toEqual(metadata)
    })

    test('add with metadata containing unicode', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const metadata = { emoji: '🚀', chinese: '中文', arabic: 'العربية' }
      const id = artifacts.add('test', 'file', '/path.txt', undefined, metadata)
      const rows = db.query<any>('SELECT metadata FROM artifacts WHERE id = ?', [id])
      expect(JSON.parse(rows[0].metadata)).toEqual(metadata)
    })

    test('list parses metadata JSON correctly', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const metadata = { key: 'value', num: 42 }
      artifacts.add('test', 'file', '/path.txt', undefined, metadata)
      const result = artifacts.list('exec-1')
      expect(result[0].metadata).toEqual(metadata)
    })

    test('list handles invalid metadata JSON gracefully', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'file', '/path.txt')
      db.run('UPDATE artifacts SET metadata = ? WHERE id = ?', ['invalid json', id])
      const result = artifacts.list('exec-1')
      expect(result[0].metadata).toEqual({})
    })
  })

  describe('add', () => {
    test('returns unique id (50 iterations)', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const artifacts = createArtifacts()

      const ids = new Set<string>()
      for (let i = 0; i < 50; i++) {
        ids.add(artifacts.add(`file${i}.txt`, 'file', `/path/${i}.txt`))
      }
      expect(ids.size).toBe(50)
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
