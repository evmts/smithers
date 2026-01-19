/**
 * Tests for vcs-queue module - VCS operation queue for serialized git/jj operations
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createSmithersDB, type SmithersDB } from './index.js'

describe('VCSQueueModule', () => {
  let db: SmithersDB

  beforeEach(() => {
    db = createSmithersDB({ reset: true })
    db.execution.start('vcs-queue-test', 'test.tsx')
  })

  afterEach(() => {
    db.close()
  })

  describe('enqueue', () => {
    test('creates queue item with pending status', () => {
      const id = db.vcsQueue.enqueue('git-commit', { message: 'test commit' })
      
      expect(id).toBeGreaterThan(0)
      
      const item = db.db.queryOne<{ status: string; operation: string }>(
        'SELECT status, operation FROM vcs_queue WHERE id = ?', [id]
      )
      expect(item!.status).toBe('pending')
      expect(item!.operation).toBe('git-commit')
    })

    test('stores payload as JSON', () => {
      const payload = { message: 'test', files: ['a.ts', 'b.ts'], nested: { key: 'value' } }
      const id = db.vcsQueue.enqueue('git-add', payload)
      
      const item = db.db.queryOne<{ payload: string }>(
        'SELECT payload FROM vcs_queue WHERE id = ?', [id]
      )
      expect(JSON.parse(item!.payload)).toEqual(payload)
    })

    test('returns unique ids', () => {
      const ids = new Set<number>()
      for (let i = 0; i < 50; i++) {
        ids.add(db.vcsQueue.enqueue('op', { index: i }))
      }
      expect(ids.size).toBe(50)
    })

    test('preserves order via id', () => {
      const id1 = db.vcsQueue.enqueue('first', {})
      const id2 = db.vcsQueue.enqueue('second', {})
      const id3 = db.vcsQueue.enqueue('third', {})
      
      expect(id1).toBeLessThan(id2)
      expect(id2).toBeLessThan(id3)
    })
  })

  describe('dequeue', () => {
    test('returns oldest pending item', () => {
      db.vcsQueue.enqueue('first', { order: 1 })
      db.vcsQueue.enqueue('second', { order: 2 })
      db.vcsQueue.enqueue('third', { order: 3 })
      
      const item = db.vcsQueue.dequeue()
      expect(item).not.toBeNull()
      expect(item!.operation).toBe('first')
      expect(item!.payload).toEqual({ order: 1 })
    })

    test('marks item as running', () => {
      const id = db.vcsQueue.enqueue('test-op', {})
      
      db.vcsQueue.dequeue()
      
      const item = db.db.queryOne<{ status: string; started_at: string }>(
        'SELECT status, started_at FROM vcs_queue WHERE id = ?', [id]
      )
      expect(item!.status).toBe('running')
      expect(item!.started_at).not.toBeNull()
    })

    test('returns null when queue is empty', () => {
      const item = db.vcsQueue.dequeue()
      expect(item).toBeNull()
    })

    test('skips running items', () => {
      const _id1 = db.vcsQueue.enqueue('first', {})
      db.vcsQueue.enqueue('second', {})
      
      db.vcsQueue.dequeue()
      
      const item = db.vcsQueue.dequeue()
      expect(item).not.toBeNull()
      expect(item!.operation).toBe('second')
    })

    test('parses payload JSON', () => {
      db.vcsQueue.enqueue('op', { key: 'value', arr: [1, 2, 3] })
      
      const item = db.vcsQueue.dequeue()
      expect(item!.payload).toEqual({ key: 'value', arr: [1, 2, 3] })
    })
  })

  describe('complete', () => {
    test('marks item as done on success', () => {
      const id = db.vcsQueue.enqueue('test-op', {})
      db.vcsQueue.dequeue()
      
      db.vcsQueue.complete(id)
      
      const item = db.db.queryOne<{ status: string; completed_at: string; error: string | null }>(
        'SELECT status, completed_at, error FROM vcs_queue WHERE id = ?', [id]
      )
      expect(item!.status).toBe('done')
      expect(item!.completed_at).not.toBeNull()
      expect(item!.error).toBeNull()
    })

    test('marks item as failed with error message', () => {
      const id = db.vcsQueue.enqueue('test-op', {})
      db.vcsQueue.dequeue()
      
      db.vcsQueue.complete(id, 'Git operation failed: conflict')
      
      const item = db.db.queryOne<{ status: string; error: string }>(
        'SELECT status, error FROM vcs_queue WHERE id = ?', [id]
      )
      expect(item!.status).toBe('failed')
      expect(item!.error).toBe('Git operation failed: conflict')
    })

    test('sets completed_at timestamp', () => {
      const id = db.vcsQueue.enqueue('test-op', {})
      db.vcsQueue.dequeue()

      const _before = new Date().toISOString()
      db.vcsQueue.complete(id)
      
      const item = db.db.queryOne<{ completed_at: string }>(
        'SELECT completed_at FROM vcs_queue WHERE id = ?', [id]
      )
      expect(item!.completed_at).toBeDefined()
    })
  })

  describe('getPending', () => {
    test('returns all pending items', () => {
      db.vcsQueue.enqueue('op1', { data: 1 })
      db.vcsQueue.enqueue('op2', { data: 2 })
      db.vcsQueue.enqueue('op3', { data: 3 })
      
      const pending = db.vcsQueue.getPending()
      expect(pending).toHaveLength(3)
    })

    test('returns items in order', () => {
      db.vcsQueue.enqueue('first', {})
      db.vcsQueue.enqueue('second', {})
      db.vcsQueue.enqueue('third', {})
      
      const pending = db.vcsQueue.getPending()
      expect(pending[0].operation).toBe('first')
      expect(pending[1].operation).toBe('second')
      expect(pending[2].operation).toBe('third')
    })

    test('excludes running items', () => {
      db.vcsQueue.enqueue('pending1', {})
      db.vcsQueue.enqueue('pending2', {})
      db.vcsQueue.dequeue()
      
      const pending = db.vcsQueue.getPending()
      expect(pending).toHaveLength(1)
      expect(pending[0].operation).toBe('pending2')
    })

    test('excludes done items', () => {
      const id = db.vcsQueue.enqueue('op', {})
      db.vcsQueue.dequeue()
      db.vcsQueue.complete(id)
      
      db.vcsQueue.enqueue('pending', {})
      
      const pending = db.vcsQueue.getPending()
      expect(pending).toHaveLength(1)
      expect(pending[0].operation).toBe('pending')
    })

    test('excludes failed items', () => {
      const id = db.vcsQueue.enqueue('op', {})
      db.vcsQueue.dequeue()
      db.vcsQueue.complete(id, 'error')
      
      db.vcsQueue.enqueue('pending', {})
      
      const pending = db.vcsQueue.getPending()
      expect(pending).toHaveLength(1)
    })

    test('returns empty array when no pending', () => {
      const pending = db.vcsQueue.getPending()
      expect(pending).toEqual([])
    })

    test('parses payload JSON for all items', () => {
      db.vcsQueue.enqueue('op1', { key1: 'value1' })
      db.vcsQueue.enqueue('op2', { key2: 'value2' })
      
      const pending = db.vcsQueue.getPending()
      expect(pending[0].payload).toEqual({ key1: 'value1' })
      expect(pending[1].payload).toEqual({ key2: 'value2' })
    })
  })

  describe('queue workflow', () => {
    test('full enqueue -> dequeue -> complete cycle', () => {
      const id = db.vcsQueue.enqueue('git-push', { remote: 'origin', branch: 'main' })
      
      expect(db.vcsQueue.getPending()).toHaveLength(1)
      
      const item = db.vcsQueue.dequeue()
      expect(item!.operation).toBe('git-push')
      expect(item!.payload).toEqual({ remote: 'origin', branch: 'main' })
      
      expect(db.vcsQueue.getPending()).toHaveLength(0)
      
      db.vcsQueue.complete(id)
      
      const finalItem = db.db.queryOne<{ status: string }>(
        'SELECT status FROM vcs_queue WHERE id = ?', [id]
      )
      expect(finalItem!.status).toBe('done')
    })

    test('multiple operations processed in order', () => {
      db.vcsQueue.enqueue('step1', { step: 1 })
      db.vcsQueue.enqueue('step2', { step: 2 })
      db.vcsQueue.enqueue('step3', { step: 3 })
      
      const item1 = db.vcsQueue.dequeue()
      expect(item1!.operation).toBe('step1')
      db.vcsQueue.complete(item1!.id)
      
      const item2 = db.vcsQueue.dequeue()
      expect(item2!.operation).toBe('step2')
      db.vcsQueue.complete(item2!.id)
      
      const item3 = db.vcsQueue.dequeue()
      expect(item3!.operation).toBe('step3')
      db.vcsQueue.complete(item3!.id)
      
      expect(db.vcsQueue.dequeue()).toBeNull()
    })

    test('handles failure and continues with next', () => {
      db.vcsQueue.enqueue('may-fail', {})
      db.vcsQueue.enqueue('should-succeed', {})
      
      const failing = db.vcsQueue.dequeue()
      db.vcsQueue.complete(failing!.id, 'operation failed')
      
      const succeeding = db.vcsQueue.dequeue()
      expect(succeeding!.operation).toBe('should-succeed')
      db.vcsQueue.complete(succeeding!.id)
    })
  })

  describe('edge cases', () => {
    test('handles empty payload', () => {
      const _id = db.vcsQueue.enqueue('simple-op', {})
      const item = db.vcsQueue.dequeue()
      expect(item!.payload).toEqual({})
    })

    test('handles unicode in payload', () => {
      db.vcsQueue.enqueue('unicode-op', { message: '你好世界 🎉', path: '/путь/файл.txt' })
      
      const item = db.vcsQueue.dequeue()
      expect(item!.payload.message).toBe('你好世界 🎉')
      expect(item!.payload.path).toBe('/путь/файл.txt')
    })

    test('handles special characters in error message', () => {
      const id = db.vcsQueue.enqueue('op', {})
      db.vcsQueue.dequeue()
      
      db.vcsQueue.complete(id, "Error: can't push to 'origin' (permission denied)")
      
      const item = db.db.queryOne<{ error: string }>(
        'SELECT error FROM vcs_queue WHERE id = ?', [id]
      )
      expect(item!.error).toBe("Error: can't push to 'origin' (permission denied)")
    })

    test('handles very large payload', () => {
      const largePayload = {
        files: Array.from({ length: 1000 }, (_, i) => `/path/to/file${i}.ts`),
        data: 'x'.repeat(10000)
      }
      
      db.vcsQueue.enqueue('large-op', largePayload)
      
      const item = db.vcsQueue.dequeue()
      expect(item!.payload).toEqual(largePayload)
    })
  })
})
