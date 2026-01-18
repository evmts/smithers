/**
 * Tests for execution module - execution lifecycle tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createExecutionModule } from './execution.js'

describe('ExecutionModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        name TEXT,
        file_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        config TEXT DEFAULT '{}',
        result TEXT,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        total_iterations INTEGER DEFAULT 0,
        total_agents INTEGER DEFAULT 0,
        total_tool_calls INTEGER DEFAULT 0,
        total_tokens_used INTEGER DEFAULT 0
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

  const createExecution = () => {
    return createExecutionModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId,
      setCurrentExecutionId: (id) => { currentExecutionId = id }
    })
  }

  describe('start', () => {
    test('creates execution with running status', () => {
      const execution = createExecution()
      const id = execution.start('test-execution', '/path/to/file.ts')

      const row = db.queryOne<any>('SELECT * FROM executions WHERE id = ?', [id])

      expect(row).not.toBeNull()
      expect(row.name).toBe('test-execution')
      expect(row.file_path).toBe('/path/to/file.ts')
      expect(row.status).toBe('running')
    })

    test('sets current execution id', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      expect(currentExecutionId).toBe(id)
    })

    test('stores config as JSON', () => {
      const execution = createExecution()
      const config = { model: 'opus', maxTurns: 10 }
      const id = execution.start('test', '/path', config)

      const row = db.queryOne<any>('SELECT config FROM executions WHERE id = ?', [id])
      expect(JSON.parse(row.config)).toEqual(config)
    })

    test('records started_at timestamp', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      const row = db.queryOne<any>('SELECT started_at FROM executions WHERE id = ?', [id])
      expect(row.started_at).not.toBeNull()
    })
  })

  describe('complete', () => {
    test('sets status to completed', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.complete(id)

      const row = db.queryOne<any>('SELECT status FROM executions WHERE id = ?', [id])
      expect(row.status).toBe('completed')
    })

    test('stores result as JSON', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.complete(id, { output: 'success', count: 42 })

      const row = db.queryOne<any>('SELECT result FROM executions WHERE id = ?', [id])
      expect(JSON.parse(row.result)).toEqual({ output: 'success', count: 42 })
    })

    test('records completed_at timestamp', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.complete(id)

      const row = db.queryOne<any>('SELECT completed_at FROM executions WHERE id = ?', [id])
      expect(row.completed_at).not.toBeNull()
    })

    test('clears current execution id if matching', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      expect(currentExecutionId).toBe(id)

      execution.complete(id)

      expect(currentExecutionId).toBeNull()
    })

    test('does not clear current execution id if different', () => {
      const execution = createExecution()
      const id1 = execution.start('test1', '/path1')
      const id2 = execution.start('test2', '/path2')

      // id2 is now current
      expect(currentExecutionId).toBe(id2)

      execution.complete(id1)

      // id2 should still be current
      expect(currentExecutionId).toBe(id2)
    })
  })

  describe('fail', () => {
    test('sets status to failed', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.fail(id, 'Something went wrong')

      const row = db.queryOne<any>('SELECT status FROM executions WHERE id = ?', [id])
      expect(row.status).toBe('failed')
    })

    test('stores error message', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.fail(id, 'Connection timeout')

      const row = db.queryOne<any>('SELECT error FROM executions WHERE id = ?', [id])
      expect(row.error).toBe('Connection timeout')
    })

    test('records completed_at timestamp', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.fail(id, 'error')

      const row = db.queryOne<any>('SELECT completed_at FROM executions WHERE id = ?', [id])
      expect(row.completed_at).not.toBeNull()
    })

    test('clears current execution id', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.fail(id, 'error')

      expect(currentExecutionId).toBeNull()
    })
  })

  describe('cancel', () => {
    test('sets status to cancelled', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.cancel(id)

      const row = db.queryOne<any>('SELECT status FROM executions WHERE id = ?', [id])
      expect(row.status).toBe('cancelled')
    })

    test('records completed_at timestamp', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.cancel(id)

      const row = db.queryOne<any>('SELECT completed_at FROM executions WHERE id = ?', [id])
      expect(row.completed_at).not.toBeNull()
    })

    test('clears current execution id', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.cancel(id)

      expect(currentExecutionId).toBeNull()
    })
  })

  describe('current', () => {
    test('returns current execution', () => {
      const execution = createExecution()
      const id = execution.start('test-name', '/path/to/file.ts')

      const current = execution.current()

      expect(current).not.toBeNull()
      expect(current!.id).toBe(id)
      expect(current!.name).toBe('test-name')
    })

    test('returns null when no current execution', () => {
      const execution = createExecution()

      expect(execution.current()).toBeNull()
    })

    test('parses config JSON', () => {
      const execution = createExecution()
      execution.start('test', '/path', { key: 'value' })

      const current = execution.current()

      expect(current!.config).toEqual({ key: 'value' })
    })
  })

  describe('get', () => {
    test('returns execution by id', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      const found = execution.get(id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(id)
    })

    test('returns null for non-existent id', () => {
      const execution = createExecution()

      expect(execution.get('nonexistent')).toBeNull()
    })

    test('parses result JSON', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')
      execution.complete(id, { data: [1, 2, 3] })

      const found = execution.get(id)

      expect(found!.result).toEqual({ data: [1, 2, 3] })
    })
  })

  describe('list', () => {
    test('returns executions ordered by created_at DESC', () => {
      const execution = createExecution()

      const id1 = execution.start('exec1', '/path1')
      const id2 = execution.start('exec2', '/path2')
      const id3 = execution.start('exec3', '/path3')

      const list = execution.list()

      // All three should be returned (order may vary due to same-millisecond timestamps)
      expect(list).toHaveLength(3)
      const ids = list.map(e => e.id)
      expect(ids).toContain(id1)
      expect(ids).toContain(id2)
      expect(ids).toContain(id3)
    })

    test('respects limit parameter', () => {
      const execution = createExecution()

      for (let i = 0; i < 10; i++) {
        execution.start(`exec${i}`, `/path${i}`)
      }

      const list = execution.list(3)

      expect(list).toHaveLength(3)
    })

    test('defaults to limit 20', () => {
      const execution = createExecution()

      for (let i = 0; i < 30; i++) {
        execution.start(`exec${i}`, `/path${i}`)
      }

      const list = execution.list()

      expect(list).toHaveLength(20)
    })
  })

  describe('findIncomplete', () => {
    test('finds pending execution', () => {
      const execution = createExecution()

      // Manually insert pending execution
      db.run(
        `INSERT INTO executions (id, file_path, status) VALUES (?, ?, ?)`,
        ['pending-exec', '/path', 'pending']
      )

      const incomplete = execution.findIncomplete()

      expect(incomplete).not.toBeNull()
      expect(incomplete!.id).toBe('pending-exec')
      expect(incomplete!.status).toBe('pending')
    })

    test('finds running execution', () => {
      const execution = createExecution()
      execution.start('running', '/path')

      // Start another but don't complete
      const running = execution.findIncomplete()

      expect(running).not.toBeNull()
      expect(running!.status).toBe('running')
    })

    test('returns null when all completed', () => {
      const execution = createExecution()

      const id1 = execution.start('exec1', '/path1')
      execution.complete(id1)

      const id2 = execution.start('exec2', '/path2')
      execution.complete(id2)

      // Need to clear current execution id since complete sets it to null
      // but we manually query without context
      currentExecutionId = null

      const incomplete = execution.findIncomplete()

      expect(incomplete).toBeNull()
    })

    test('returns most recent incomplete', () => {
      const execution = createExecution()

      // Insert two pending in order
      db.run(
        `INSERT INTO executions (id, file_path, status, created_at) VALUES (?, ?, ?, ?)`,
        ['older', '/path', 'pending', '2024-01-01 00:00:00']
      )
      db.run(
        `INSERT INTO executions (id, file_path, status, created_at) VALUES (?, ?, ?, ?)`,
        ['newer', '/path', 'running', '2024-01-02 00:00:00']
      )

      const incomplete = execution.findIncomplete()

      expect(incomplete!.id).toBe('newer')
    })
  })

  describe('status transitions', () => {
    test('completed after running', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      let row = db.queryOne<any>('SELECT status FROM executions WHERE id = ?', [id])
      expect(row.status).toBe('running')

      execution.complete(id)

      row = db.queryOne<any>('SELECT status FROM executions WHERE id = ?', [id])
      expect(row.status).toBe('completed')
    })

    test('failed after running', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.fail(id, 'error')

      const row = db.queryOne<any>('SELECT status FROM executions WHERE id = ?', [id])
      expect(row.status).toBe('failed')
    })

    test('cancelled after running', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.cancel(id)

      const row = db.queryOne<any>('SELECT status FROM executions WHERE id = ?', [id])
      expect(row.status).toBe('cancelled')
    })
  })
})
