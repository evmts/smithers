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

  describe('confidence boundaries', () => {
    test('accepts confidence of 0.0', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'uncertain',
        content: 'very uncertain fact',
        confidence: 0.0
      })

      const memory = db.queryOne<any>('SELECT confidence FROM memories WHERE id = ?', [id])
      expect(memory.confidence).toBe(0.0)
    })

    test('accepts confidence of 1.0', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'certain',
        content: 'very certain fact',
        confidence: 1.0
      })

      const memory = db.queryOne<any>('SELECT confidence FROM memories WHERE id = ?', [id])
      expect(memory.confidence).toBe(1.0)
    })

    test('accepts negative confidence (no validation)', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'negative',
        content: 'negative confidence',
        confidence: -0.5
      })

      const memory = db.queryOne<any>('SELECT confidence FROM memories WHERE id = ?', [id])
      expect(memory.confidence).toBe(-0.5)
    })

    test('accepts confidence greater than 1.0 (no validation)', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'over',
        content: 'over confident',
        confidence: 2.5
      })

      const memory = db.queryOne<any>('SELECT confidence FROM memories WHERE id = ?', [id])
      expect(memory.confidence).toBe(2.5)
    })

    test('update can set confidence to boundary values', () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'value', confidence: 0.5 })

      memories.update(id, { confidence: 0.0 })
      expect(db.queryOne<any>('SELECT confidence FROM memories WHERE id = ?', [id]).confidence).toBe(0.0)

      memories.update(id, { confidence: 1.0 })
      expect(db.queryOne<any>('SELECT confidence FROM memories WHERE id = ?', [id]).confidence).toBe(1.0)
    })
  })

  describe('special content', () => {
    test('handles special characters in content', () => {
      const memories = createMemories()
      const specialContent = `Unicode: 日本語 中文 한국어\nEmoji: 🚀 💻 🎉\nSymbols: © ® ™ § ¶\nQuotes: "double" 'single' \`backtick\``

      const id = memories.add({
        category: 'fact',
        key: 'special',
        content: specialContent
      })

      const memory = memories.get('fact', 'special')
      expect(memory!.content).toBe(specialContent)
    })

    test('handles SQL injection attempts in content', () => {
      const memories = createMemories()
      const maliciousContent = "'; DROP TABLE memories; --"

      const id = memories.add({
        category: 'fact',
        key: 'sql-test',
        content: maliciousContent
      })

      const memory = memories.get('fact', 'sql-test')
      expect(memory!.content).toBe(maliciousContent)

      // Table should still exist
      const count = db.queryValue<number>('SELECT COUNT(*) FROM memories')
      expect(count).toBeGreaterThan(0)
    })

    test('handles special characters in key', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'key/with/slashes-and_underscores.and.dots',
        content: 'value'
      })

      const memory = memories.get('fact', 'key/with/slashes-and_underscores.and.dots')
      expect(memory!.content).toBe('value')
    })

    test('handles empty content', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'empty',
        content: ''
      })

      const memory = memories.get('fact', 'empty')
      expect(memory!.content).toBe('')
    })

    test('handles very long content', () => {
      const memories = createMemories()
      const longContent = 'x'.repeat(100000)

      const id = memories.add({
        category: 'fact',
        key: 'long',
        content: longContent
      })

      const memory = memories.get('fact', 'long')
      expect(memory!.content).toBe(longContent)
      expect(memory!.content.length).toBe(100000)
    })

    test('handles newlines and tabs in content', () => {
      const memories = createMemories()
      const content = "line1\nline2\n\tindented\r\nwindows"

      const id = memories.add({
        category: 'fact',
        key: 'whitespace',
        content
      })

      const memory = memories.get('fact', 'whitespace')
      expect(memory!.content).toBe(content)
    })
  })

  describe('search edge cases', () => {
    test('search with SQL wildcard characters', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'contains % percent' })
      memories.add({ category: 'fact', key: 'k2', content: 'contains _ underscore' })
      memories.add({ category: 'fact', key: 'k3', content: 'normal content' })

      // Note: SQLite LIKE doesn't escape these by default
      const percentResults = memories.search('%')
      expect(percentResults.length).toBeGreaterThanOrEqual(1)

      const underscoreResults = memories.search('_')
      expect(underscoreResults.length).toBeGreaterThanOrEqual(1)
    })

    test('search with empty query matches all', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'content1' })
      memories.add({ category: 'fact', key: 'k2', content: 'content2' })

      const results = memories.search('')
      expect(results).toHaveLength(2)
    })

    test('search is case insensitive (SQLite default)', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'TypeScript' })

      const lowerResults = memories.search('typescript')
      const upperResults = memories.search('TYPESCRIPT')
      const mixedResults = memories.search('TyPeScRiPt')

      expect(lowerResults).toHaveLength(1)
      expect(upperResults).toHaveLength(1)
      expect(mixedResults).toHaveLength(1)
    })

    test('search orders by created_at descending', () => {
      const memories = createMemories()
      // Manually insert with different timestamps to test ordering
      db.run(
        `INSERT INTO memories (id, category, scope, key, content, confidence, created_at, updated_at, accessed_at)
         VALUES ('id1', 'fact', 'global', 'k1', 'match first', 1.0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')`
      )
      db.run(
        `INSERT INTO memories (id, category, scope, key, content, confidence, created_at, updated_at, accessed_at)
         VALUES ('id2', 'fact', 'global', 'k2', 'match second', 1.0, '2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z')`
      )
      db.run(
        `INSERT INTO memories (id, category, scope, key, content, confidence, created_at, updated_at, accessed_at)
         VALUES ('id3', 'fact', 'global', 'k3', 'match third', 1.0, '2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z')`
      )

      const results = memories.search('match')

      expect(results).toHaveLength(3)
      // Most recent first
      expect(results[0].key).toBe('k3')
      expect(results[2].key).toBe('k1')
    })
  })

  describe('deduplication', () => {
    test('duplicate category/key/scope throws constraint error', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'unique', content: 'first', scope: 'global' })

      expect(() => {
        memories.add({ category: 'fact', key: 'unique', content: 'second', scope: 'global' })
      }).toThrow()
    })

    test('same key different category is allowed', () => {
      const memories = createMemories()
      const id1 = memories.add({ category: 'fact', key: 'shared', content: 'fact content' })
      const id2 = memories.add({ category: 'learning', key: 'shared', content: 'learning content' })

      expect(id1).not.toBe(id2)
      expect(memories.get('fact', 'shared')!.content).toBe('fact content')
      expect(memories.get('learning', 'shared')!.content).toBe('learning content')
    })

    test('same key different scope is allowed', () => {
      const memories = createMemories()
      memories.add({ category: 'pref', key: 'theme', content: 'dark', scope: 'global' })
      memories.add({ category: 'pref', key: 'theme', content: 'light', scope: 'project' })
      memories.add({ category: 'pref', key: 'theme', content: 'blue', scope: 'session' })

      expect(memories.get('pref', 'theme', 'global')!.content).toBe('dark')
      expect(memories.get('pref', 'theme', 'project')!.content).toBe('light')
      expect(memories.get('pref', 'theme', 'session')!.content).toBe('blue')
    })
  })

  describe('source tracking', () => {
    test('tracks source in memory', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'language',
        content: 'TypeScript',
        source: 'package.json analysis'
      })

      const memory = db.queryOne<any>('SELECT source FROM memories WHERE id = ?', [id])
      expect(memory.source).toBe('package.json analysis')
    })

    test('source defaults to null', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'test',
        content: 'value'
      })

      const memory = db.queryOne<any>('SELECT source FROM memories WHERE id = ?', [id])
      expect(memory.source).toBeNull()
    })

    test('tracks source_execution_id from context', () => {
      currentExecutionId = 'exec-123'
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'test',
        content: 'value'
      })

      const memory = db.queryOne<any>('SELECT source_execution_id FROM memories WHERE id = ?', [id])
      expect(memory.source_execution_id).toBe('exec-123')
    })

    test('source_execution_id is null when no execution context', () => {
      currentExecutionId = null
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'test',
        content: 'value'
      })

      const memory = db.queryOne<any>('SELECT source_execution_id FROM memories WHERE id = ?', [id])
      expect(memory.source_execution_id).toBeNull()
    })
  })

  describe('convenience methods edge cases', () => {
    test('addFact without source', () => {
      const memories = createMemories()

      const id = memories.addFact('key', 'content')

      const memory = db.queryOne<any>('SELECT * FROM memories WHERE id = ?', [id])
      expect(memory.category).toBe('fact')
      expect(memory.source).toBeNull()
      expect(memory.scope).toBe('global')
    })

    test('addLearning without source', () => {
      const memories = createMemories()

      const id = memories.addLearning('pattern', 'learned this')

      const memory = db.queryOne<any>('SELECT * FROM memories WHERE id = ?', [id])
      expect(memory.category).toBe('learning')
      expect(memory.source).toBeNull()
    })

    test('addPreference without scope defaults to global', () => {
      const memories = createMemories()

      const id = memories.addPreference('theme', 'dark')

      const memory = db.queryOne<any>('SELECT scope FROM memories WHERE id = ?', [id])
      expect(memory.scope).toBe('global')
    })

    test('addPreference with session scope', () => {
      const memories = createMemories()

      const id = memories.addPreference('temp', 'value', 'session')

      const memory = db.queryOne<any>('SELECT scope FROM memories WHERE id = ?', [id])
      expect(memory.scope).toBe('session')
    })
  })

  describe('update edge cases', () => {
    test('update with empty updates still sets updated_at', async () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'value' })

      const before = db.queryOne<any>('SELECT updated_at FROM memories WHERE id = ?', [id])
      await new Promise(resolve => setTimeout(resolve, 10))

      memories.update(id, {})

      const after = db.queryOne<any>('SELECT updated_at FROM memories WHERE id = ?', [id])
      expect(after.updated_at).not.toBe(before.updated_at)
    })

    test('update can clear expires_at by setting to null', () => {
      const memories = createMemories()
      const id = memories.add({
        category: 'fact',
        key: 'test',
        content: 'value',
        expires_at: new Date('2025-12-31')
      })

      // Note: must pass null explicitly, not undefined (undefined means "don't update")
      memories.update(id, { expires_at: null as any })

      const memory = db.queryOne<any>('SELECT expires_at FROM memories WHERE id = ?', [id])
      expect(memory.expires_at).toBeNull()
    })

    test('update non-existent id does not throw', () => {
      const memories = createMemories()

      expect(() => {
        memories.update('non-existent-id', { content: 'new' })
      }).not.toThrow()
    })

    test('update multiple fields at once', () => {
      const memories = createMemories()
      const id = memories.add({
        category: 'fact',
        key: 'test',
        content: 'original',
        confidence: 0.5
      })

      const newExpiry = new Date('2030-01-01')
      memories.update(id, {
        content: 'updated content',
        confidence: 0.95,
        expires_at: newExpiry
      })

      const memory = db.queryOne<any>('SELECT * FROM memories WHERE id = ?', [id])
      expect(memory.content).toBe('updated content')
      expect(memory.confidence).toBe(0.95)
      expect(memory.expires_at).toBe(newExpiry.toISOString())
    })
  })

  describe('list edge cases', () => {
    test('list with limit 0 returns empty', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1' })

      const result = memories.list(undefined, undefined, 0)
      expect(result).toHaveLength(0)
    })

    test('list with very large limit', () => {
      const memories = createMemories()
      for (let i = 0; i < 10; i++) {
        memories.add({ category: 'fact', key: `k${i}`, content: `c${i}` })
      }

      const result = memories.list(undefined, undefined, 1000000)
      expect(result).toHaveLength(10)
    })

    test('list orders by created_at descending', () => {
      const memories = createMemories()
      // Manually insert with different timestamps to test ordering
      db.run(
        `INSERT INTO memories (id, category, scope, key, content, confidence, created_at, updated_at, accessed_at)
         VALUES ('id1', 'fact', 'global', 'first', 'c1', 1.0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')`
      )
      db.run(
        `INSERT INTO memories (id, category, scope, key, content, confidence, created_at, updated_at, accessed_at)
         VALUES ('id2', 'fact', 'global', 'second', 'c2', 1.0, '2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z')`
      )
      db.run(
        `INSERT INTO memories (id, category, scope, key, content, confidence, created_at, updated_at, accessed_at)
         VALUES ('id3', 'fact', 'global', 'third', 'c3', 1.0, '2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z')`
      )

      const result = memories.list()

      expect(result[0].key).toBe('third')
      expect(result[2].key).toBe('first')
    })

    test('list with non-existent category returns empty', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1' })

      const result = memories.list('nonexistent')
      expect(result).toHaveLength(0)
    })

    test('list with non-existent scope returns empty', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'c1', scope: 'global' })

      const result = memories.list(undefined, 'session')
      expect(result).toHaveLength(0)
    })
  })

  describe('get edge cases', () => {
    test('get without scope returns any matching memory', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'shared', content: 'project content', scope: 'project' })

      const memory = memories.get('fact', 'shared')
      expect(memory).not.toBeNull()
      expect(memory!.content).toBe('project content')
    })

    test('get with scope null matches scope filter correctly', () => {
      const memories = createMemories()
      memories.add({ category: 'fact', key: 'k1', content: 'global', scope: 'global' })
      memories.add({ category: 'fact', key: 'k2', content: 'project', scope: 'project' })

      // Without scope filter, matches any
      const anyMatch = memories.get('fact', 'k1')
      expect(anyMatch!.content).toBe('global')

      const noMatch = memories.get('fact', 'k1', 'project')
      expect(noMatch).toBeNull()
    })
  })

  describe('timestamps', () => {
    test('created_at, updated_at, accessed_at are set on add', () => {
      const memories = createMemories()

      const id = memories.add({
        category: 'fact',
        key: 'test',
        content: 'value'
      })

      const memory = db.queryOne<any>('SELECT created_at, updated_at, accessed_at FROM memories WHERE id = ?', [id])

      expect(memory.created_at).toBeDefined()
      expect(memory.updated_at).toBeDefined()
      expect(memory.accessed_at).toBeDefined()
      expect(memory.created_at).toBe(memory.updated_at)
      expect(memory.created_at).toBe(memory.accessed_at)
    })

    test('multiple rapid gets update accessed_at', async () => {
      const memories = createMemories()
      const id = memories.add({ category: 'fact', key: 'test', content: 'value' })

      const initial = db.queryOne<any>('SELECT accessed_at FROM memories WHERE id = ?', [id]).accessed_at

      await new Promise(resolve => setTimeout(resolve, 10))
      memories.get('fact', 'test')
      const after1 = db.queryOne<any>('SELECT accessed_at FROM memories WHERE id = ?', [id]).accessed_at

      await new Promise(resolve => setTimeout(resolve, 10))
      memories.get('fact', 'test')
      const after2 = db.queryOne<any>('SELECT accessed_at FROM memories WHERE id = ?', [id]).accessed_at

      expect(after1).not.toBe(initial)
      expect(after2).not.toBe(after1)
    })
  })

  describe('return values', () => {
    test('add returns unique id', () => {
      const memories = createMemories()

      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const id = memories.add({ category: 'fact', key: `k${i}`, content: `c${i}` })
        ids.add(id)
      }

      expect(ids.size).toBe(100)
    })

    test('get returns full Memory object', () => {
      currentExecutionId = 'exec-test'
      const memories = createMemories()
      const expires = new Date('2025-12-31')

      memories.add({
        category: 'fact',
        scope: 'project',
        key: 'language',
        content: 'TypeScript',
        confidence: 0.9,
        source: 'detection',
        expires_at: expires
      })

      const memory = memories.get('fact', 'language', 'project')

      expect(memory).toMatchObject({
        category: 'fact',
        scope: 'project',
        key: 'language',
        content: 'TypeScript',
        confidence: 0.9,
        source: 'detection',
        source_execution_id: 'exec-test'
      })
      expect(memory!.id).toBeDefined()
      expect(memory!.created_at).toBeDefined()
      expect(memory!.updated_at).toBeDefined()
      expect(memory!.accessed_at).toBeDefined()
    })
  })
})
