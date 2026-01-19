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

  describe('Type validation', () => {
    test('add with type file', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'file', '/path.txt')
      const rows = db.query<any>('SELECT type FROM artifacts WHERE id = ?', [id])
      expect(rows[0].type).toBe('file')
    })

    test('add with type code', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'code', '/path.ts')
      const rows = db.query<any>('SELECT type FROM artifacts WHERE id = ?', [id])
      expect(rows[0].type).toBe('code')
    })

    test('add with type document', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'document', '/doc.md')
      const rows = db.query<any>('SELECT type FROM artifacts WHERE id = ?', [id])
      expect(rows[0].type).toBe('document')
    })

    test('add with type image', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'image', '/image.png')
      const rows = db.query<any>('SELECT type FROM artifacts WHERE id = ?', [id])
      expect(rows[0].type).toBe('image')
    })

    test('add with type data', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'data', '/data.json')
      const rows = db.query<any>('SELECT type FROM artifacts WHERE id = ?', [id])
      expect(rows[0].type).toBe('data')
    })
  })

  describe('Unicode/special characters', () => {
    test('add with unicode in name', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('文件🚀', 'file', '/path.txt')
      const rows = db.query<any>('SELECT name FROM artifacts WHERE id = ?', [id])
      expect(rows[0].name).toBe('文件🚀')
    })

    test('add with unicode in file_path', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'file', '/路径/文件.txt')
      const rows = db.query<any>('SELECT file_path FROM artifacts WHERE id = ?', [id])
      expect(rows[0].file_path).toBe('/路径/文件.txt')
    })

    test('add with special characters in file_path', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const id = artifacts.add('test', 'file', '/path with spaces/file (1).txt')
      const rows = db.query<any>('SELECT file_path FROM artifacts WHERE id = ?', [id])
      expect(rows[0].file_path).toBe('/path with spaces/file (1).txt')
    })
  })

  describe('SQL injection prevention', () => {
    test('add is safe against SQL injection in name', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const malicious = "'; DROP TABLE artifacts; --"
      const id = artifacts.add(malicious, 'file', '/path.txt')
      const rows = db.query<any>('SELECT name FROM artifacts WHERE id = ?', [id])
      expect(rows[0].name).toBe(malicious)
      const check = db.query<any>('SELECT * FROM artifacts')
      expect(check).toHaveLength(1)
    })

    test('add is safe against SQL injection in file_path', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const malicious = "/path'; DROP TABLE artifacts; --"
      const id = artifacts.add('test', 'file', malicious)
      const rows = db.query<any>('SELECT file_path FROM artifacts WHERE id = ?', [id])
      expect(rows[0].file_path).toBe(malicious)
    })

    test('add is safe against SQL injection in type', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      const malicious = "file'; DROP TABLE artifacts; --"
      const id = artifacts.add('test', malicious as any, '/path.txt')
      const rows = db.query<any>('SELECT type FROM artifacts WHERE id = ?', [id])
      expect(rows[0].type).toBe(malicious)
    })
  })

  describe('mapArtifact edge cases', () => {
    test('list returns artifacts with parsed dates', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      artifacts.add('test', 'file', '/path.txt')
      const result = artifacts.list('exec-1')
      expect(result[0].created_at).toBeInstanceOf(Date)
    })

    test('list returns artifacts with undefined for null optional fields', () => {
      setActiveExecution('exec-1')
      const artifacts = createArtifacts()
      artifacts.add('test', 'file', '/path.txt')
      const result = artifacts.list('exec-1')
      expect(result[0].agent_id).toBeUndefined()
      expect(result[0].git_hash).toBeUndefined()
      expect(result[0].git_commit).toBeUndefined()
      expect(result[0].summary).toBeUndefined()
      expect(result[0].line_count).toBeUndefined()
      expect(result[0].byte_size).toBeUndefined()
    })
  })
})
