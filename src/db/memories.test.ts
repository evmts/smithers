/**
 * Tests for memories module - memory CRUD operations
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createMemoriesModule } from './memories.js'

describe('MemoriesModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'global',
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        source TEXT,
        source_execution_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        accessed_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT,
        UNIQUE(category, key, scope)
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

  const createMemories = () => {
    return createMemoriesModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId
    })
  }

  describe('add', () => {
    test('creates memory with all fields', () => {
      currentExecutionId = 'exec-1'
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        scope: 'project',
        key: 'language',
        content: 'TypeScript',
        confidence: 0.9,
        source: 'package.json'
      })

      const memory = db.queryOne<any>('SELECT * FROM memories WHERE id = ?', [id])

      expect(memory).not.toBeNull()
      expect(memory.category).toBe('fact')
      expect(memory.scope).toBe('project')
      expect(memory.key).toBe('language')
      expect(memory.content).toBe('TypeScript')
      expect(memory.confidence).toBe(0.9)
      expect(memory.source).toBe('package.json')
      expect(memory.source_execution_id).toBe('exec-1')
    })

    test('defaults scope to global', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'preference',
        key: 'theme',
        content: 'dark'
      })

      const memory = db.queryOne<any>('SELECT scope FROM memories WHERE id = ?', [id])
      expect(memory.scope).toBe('global')
    })

    test('defaults confidence to 1.0', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'test',
        content: 'value'
      })

      const memory = db.queryOne<any>('SELECT confidence FROM memories WHERE id = ?', [id])
      expect(memory.confidence).toBe(1.0)
    })

    test('stores expires_at as ISO string', () => {
      const memories = createMemories()
      const expires = new Date('2025-12-31T23:59:59Z')

      const id = memories.add({
        category: 'context',
        key: 'session',
        content: 'temp data',
        expires_at: expires
      })

      const memory = db.queryOne<any>('SELECT expires_at FROM memories WHERE id = ?', [id])
      expect(memory.expires_at).toBe(expires.toISOString())
    })
  })

  describe('get', () => {
    test('retrieves memory by category and key', () => {
      const memories = createMemories()
      memories.add({
        category: 'fact',
        key: 'language',
        content: 'TypeScript'
      })

      const memory = memories.get('fact', 'language')

      expect(memory).not.toBeNull()
      expect(memory!.content).toBe('TypeScript')
    })

    test('retrieves memory with scope filter', () => {
      const memories = createMemories()
      memories.add({ category: 'pref', key: 'theme', content: 'dark', scope: 'global' })
      memories.add({ category: 'pref', key: 'theme', content: 'light', scope: 'project' })

      const global = memories.get('pref', 'theme', 'global')
      const project = memories.get('pref', 'theme', 'project')

      expect(global!.content).toBe('dark')
      expect(project!.content).toBe('light')
    })

    test('returns null for non-existent memory', () => {
      const memories = createMemories()

      const memory = memories.get('nonexistent', 'key')

      expect(memory).toBeNull()
    })

    test('updates accessed_at on retrieval', async () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'value' })

      const before = db.queryOne<any>('SELECT accessed_at FROM memories WHERE id = ?', [id])

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      memories.get('fact', 'test')

      const after = db.queryOne<any>('SELECT accessed_at FROM memories WHERE id = ?', [id])

      // accessed_at should be updated
      expect(after.accessed_at).not.toBe(before.accessed_at)
    })
  })

  describe('list', () => {
    test('returns all memories', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1' })
      memories.add({ category: 'fact', key: 'k2', content: 'c2' })
      memories.add({ category: 'pref', key: 'k3', content: 'c3' })

      const list = memories.list()

      expect(list).toHaveLength(3)
    })

    test('filters by category', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1' })
      memories.add({ category: 'fact', key: 'k2', content: 'c2' })
      memories.add({ category: 'pref', key: 'k3', content: 'c3' })

      const facts = memories.list('fact')

      expect(facts).toHaveLength(2)
      expect(facts.every(m => m.category === 'fact')).toBe(true)
    })

    test('filters by scope', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1', scope: 'global' })
      memories.add({ category: 'fact', key: 'k2', content: 'c2', scope: 'project' })
      memories.add({ category: 'fact', key: 'k3', content: 'c3', scope: 'project' })

      const project = memories.list(undefined, 'project')

      expect(project).toHaveLength(2)
      expect(project.every(m => m.scope === 'project')).toBe(true)
    })

    test('filters by both category and scope', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1', scope: 'global' })
      memories.add({ category: 'fact', key: 'k2', content: 'c2', scope: 'project' })
      memories.add({ category: 'pref', key: 'k3', content: 'c3', scope: 'project' })

      const result = memories.list('fact', 'project')

      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('k2')
    })

    test('respects limit parameter', () => {
      const memories = createMemories()
      for (let i = 0; i < 20; i++) {
        memories.add({ category: 'fact', key: `k${i}`, content: `c${i}` })
      }

      const limited = memories.list(undefined, undefined, 5)

      expect(limited).toHaveLength(5)
    })
  })

  describe('search', () => {
    test('searches content with LIKE pattern', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'TypeScript is great' })
      memories.add({ category: 'fact', key: 'k2', content: 'JavaScript also' })
      memories.add({ category: 'fact', key: 'k3', content: 'Python too' })

      const results = memories.search('Script')

      expect(results).toHaveLength(2)
      expect(results.every(m => m.content.includes('Script'))).toBe(true)
    })

    test('filters search by category', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'TypeScript' })
      memories.add({ category: 'pref', key: 'k2', content: 'TypeScript preferred' })

      const results = memories.search('TypeScript', 'fact')

      expect(results).toHaveLength(1)
      expect(results[0].category).toBe('fact')
    })

    test('respects limit parameter', () => {
      const memories = createMemories()
      for (let i = 0; i < 20; i++) {
        memories.add({ category: 'fact', key: `k${i}`, content: `match ${i}` })
      }

      const results = memories.search('match', undefined, 5)

      expect(results).toHaveLength(5)
    })

    test('returns empty array for no matches', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'hello world' })

      const results = memories.search('nonexistent')

      expect(results).toEqual([])
    })
  })

  describe('update', () => {
    test('updates content', () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'original' })

      memories.update(id, { content: 'updated' })

      const memory = db.queryOne<any>('SELECT content FROM memories WHERE id = ?', [id])
      expect(memory.content).toBe('updated')
    })

    test('updates confidence', () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'value', confidence: 0.5 })

      memories.update(id, { confidence: 0.9 })

      const memory = db.queryOne<any>('SELECT confidence FROM memories WHERE id = ?', [id])
      expect(memory.confidence).toBe(0.9)
    })

    test('updates expires_at', () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'value' })
      const newExpiry = new Date('2026-01-01')

      memories.update(id, { expires_at: newExpiry })

      const memory = db.queryOne<any>('SELECT expires_at FROM memories WHERE id = ?', [id])
      expect(memory.expires_at).toBe(newExpiry.toISOString())
    })

    test('sets updated_at timestamp', async () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'value' })

      const before = db.queryOne<any>('SELECT updated_at FROM memories WHERE id = ?', [id])

      await new Promise(resolve => setTimeout(resolve, 10))

      memories.update(id, { content: 'new value' })

      const after = db.queryOne<any>('SELECT updated_at FROM memories WHERE id = ?', [id])
      expect(after.updated_at).not.toBe(before.updated_at)
    })
  })

  describe('delete', () => {
    test('removes memory', () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'value' })

      memories.delete(id)

      const memory = db.queryOne<any>('SELECT * FROM memories WHERE id = ?', [id])
      expect(memory).toBeNull()
    })

    test('handles non-existent id gracefully', () => {
      const memories = createMemories()

      // Should not throw
      expect(() => memories.delete('nonexistent')).not.toThrow()
    })
  })

  describe('convenience methods', () => {
    test('addFact creates fact category memory', () => {
      const memories = createMemories()

      const id = memories.addFact('language', 'TypeScript', 'package.json')

      const memory = db.queryOne<any>('SELECT * FROM memories WHERE id = ?', [id])
      expect(memory.category).toBe('fact')
      expect(memory.key).toBe('language')
      expect(memory.content).toBe('TypeScript')
      expect(memory.source).toBe('package.json')
    })

    test('addLearning creates learning category memory', () => {
      const memories = createMemories()

      const id = memories.addLearning('pattern', 'Always use bun', 'user feedback')

      const memory = db.queryOne<any>('SELECT * FROM memories WHERE id = ?', [id])
      expect(memory.category).toBe('learning')
      expect(memory.key).toBe('pattern')
      expect(memory.content).toBe('Always use bun')
    })

    test('addPreference creates preference category memory with scope', () => {
      const memories = createMemories()

      const id = memories.addPreference('editor', 'vim', 'project')

      const memory = db.queryOne<any>('SELECT * FROM memories WHERE id = ?', [id])
      expect(memory.category).toBe('preference')
      expect(memory.key).toBe('editor')
      expect(memory.content).toBe('vim')
      expect(memory.scope).toBe('project')
    })
  })

  describe('stats', () => {
    test('returns total count', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1' })
      memories.add({ category: 'fact', key: 'k2', content: 'c2' })
      memories.add({ category: 'pref', key: 'k3', content: 'c3' })

      const stats = memories.stats()

      expect(stats.total).toBe(3)
    })

    test('returns count by category', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1' })
      memories.add({ category: 'fact', key: 'k2', content: 'c2' })
      memories.add({ category: 'learning', key: 'k3', content: 'c3' })

      const stats = memories.stats()

      expect(stats.byCategory).toEqual({
        fact: 2,
        learning: 1
      })
    })

    test('returns count by scope', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1', scope: 'global' })
      memories.add({ category: 'fact', key: 'k2', content: 'c2', scope: 'project' })
      memories.add({ category: 'fact', key: 'k3', content: 'c3', scope: 'project' })

      const stats = memories.stats()

      expect(stats.byScope).toEqual({
        global: 1,
        project: 2
      })
    })

    test('returns zeros for empty database', () => {
      const memories = createMemories()

      const stats = memories.stats()

      expect(stats.total).toBe(0)
      expect(stats.byCategory).toEqual({})
      expect(stats.byScope).toEqual({})
    })
  })
})
