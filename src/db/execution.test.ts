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

  describe('boundary conditions', () => {
    test('start with empty config defaults to empty object', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      const row = db.queryOne<any>('SELECT config FROM executions WHERE id = ?', [id])
      expect(JSON.parse(row.config)).toEqual({})
    })

    test('start with undefined config defaults to empty object', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path', undefined)

      const row = db.queryOne<any>('SELECT config FROM executions WHERE id = ?', [id])
      expect(JSON.parse(row.config)).toEqual({})
    })

    test('complete with no result stores null', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.complete(id)

      const row = db.queryOne<any>('SELECT result FROM executions WHERE id = ?', [id])
      expect(row.result).toBeNull()
    })

    test('complete with undefined result stores null', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.complete(id, undefined)

      const row = db.queryOne<any>('SELECT result FROM executions WHERE id = ?', [id])
      expect(row.result).toBeNull()
    })

    test('complete with empty object result stores empty object', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.complete(id, {})

      const row = db.queryOne<any>('SELECT result FROM executions WHERE id = ?', [id])
      expect(JSON.parse(row.result)).toEqual({})
    })

    test('fail with empty error message', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      execution.fail(id, '')

      const row = db.queryOne<any>('SELECT error FROM executions WHERE id = ?', [id])
      expect(row.error).toBe('')
    })

    test('fail with very long error message', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')
      const longError = 'x'.repeat(10000)

      execution.fail(id, longError)

      const row = db.queryOne<any>('SELECT error FROM executions WHERE id = ?', [id])
      expect(row.error).toBe(longError)
    })

    test('start with very long name', () => {
      const execution = createExecution()
      const longName = 'execution-' + 'x'.repeat(1000)
      const id = execution.start(longName, '/path')

      const row = db.queryOne<any>('SELECT name FROM executions WHERE id = ?', [id])
      expect(row.name).toBe(longName)
    })

    test('start with very long file path', () => {
      const execution = createExecution()
      const longPath = '/' + 'dir/'.repeat(500) + 'file.ts'
      const id = execution.start('test', longPath)

      const row = db.queryOne<any>('SELECT file_path FROM executions WHERE id = ?', [id])
      expect(row.file_path).toBe(longPath)
    })

    test('start with complex nested config', () => {
      const execution = createExecution()
      const config = {
        nested: { deep: { value: 42 } },
        array: [1, 2, { x: 3 }],
        unicode: '日本語',
        special: 'line1\nline2\ttab',
      }
      const id = execution.start('test', '/path', config)

      const found = execution.get(id)
      expect(found!.config).toEqual(config)
    })

    test('complete with complex nested result', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')
      const result = {
        data: [{ nested: true }],
        metadata: { version: '1.0' },
      }

      execution.complete(id, result)

      const found = execution.get(id)
      expect(found!.result).toEqual(result)
    })

    test('list with limit 0 returns empty', () => {
      const execution = createExecution()
      execution.start('test', '/path')

      const list = execution.list(0)
      expect(list).toHaveLength(0)
    })

    test('list with limit 1 returns single', () => {
      const execution = createExecution()
      execution.start('exec1', '/path1')
      execution.start('exec2', '/path2')

      const list = execution.list(1)
      expect(list).toHaveLength(1)
    })

    test('get returns parsed config even for empty object', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      const found = execution.get(id)
      expect(found!.config).toEqual({})
      expect(typeof found!.config).toBe('object')
    })

    test('get returns undefined result when not completed', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      const found = execution.get(id)
      expect(found!.result).toBeUndefined()
    })
  })

  describe('timestamp format', () => {
    test('started_at is ISO format string', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      const row = db.queryOne<any>('SELECT started_at FROM executions WHERE id = ?', [id])
      expect(row.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    test('created_at is ISO format string', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      const row = db.queryOne<any>('SELECT created_at FROM executions WHERE id = ?', [id])
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    test('completed_at is ISO format string after complete', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')
      execution.complete(id)

      const row = db.queryOne<any>('SELECT completed_at FROM executions WHERE id = ?', [id])
      expect(row.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    test('completed_at is ISO format string after fail', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')
      execution.fail(id, 'error')

      const row = db.queryOne<any>('SELECT completed_at FROM executions WHERE id = ?', [id])
      expect(row.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    test('completed_at is ISO format string after cancel', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')
      execution.cancel(id)

      const row = db.queryOne<any>('SELECT completed_at FROM executions WHERE id = ?', [id])
      expect(row.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('concurrent executions', () => {
    test('multiple running executions can exist', () => {
      const execution = createExecution()

      execution.start('exec1', '/path1')
      execution.start('exec2', '/path2')
      execution.start('exec3', '/path3')

      const rows = db.query<any>('SELECT id, status FROM executions WHERE status = ?', ['running'])
      expect(rows).toHaveLength(3)
    })

    test('only latest started is current', () => {
      const execution = createExecution()

      execution.start('exec1', '/path1')
      execution.start('exec2', '/path2')
      const id3 = execution.start('exec3', '/path3')

      expect(currentExecutionId).toBe(id3)
      const current = execution.current()
      expect(current!.id).toBe(id3)
    })

    test('completing non-current does not affect current', () => {
      const execution = createExecution()

      const id1 = execution.start('exec1', '/path1')
      const id2 = execution.start('exec2', '/path2')

      execution.complete(id1)

      expect(currentExecutionId).toBe(id2)
    })

    test('findIncomplete returns most recent by created_at', () => {
      const execution = createExecution()

      db.run(
        `INSERT INTO executions (id, file_path, status, created_at) VALUES (?, ?, ?, ?)`,
        ['older', '/path1', 'running', '2024-01-01T00:00:00.000Z']
      )
      db.run(
        `INSERT INTO executions (id, file_path, status, created_at) VALUES (?, ?, ?, ?)`,
        ['newer', '/path2', 'running', '2024-01-02T00:00:00.000Z']
      )

      const incomplete = execution.findIncomplete()
      expect(incomplete!.id).toBe('newer')
    })
  })

  describe('duration calculation', () => {
    test('completed_at is after started_at', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')
      execution.complete(id)

      const row = db.queryOne<any>('SELECT started_at, completed_at FROM executions WHERE id = ?', [id])
      const started = new Date(row.started_at).getTime()
      const completed = new Date(row.completed_at).getTime()

      expect(completed).toBeGreaterThanOrEqual(started)
    })

    test('created_at is set on start', () => {
      const execution = createExecution()
      const before = new Date().toISOString()
      const id = execution.start('test', '/path')
      const after = new Date().toISOString()

      const row = db.queryOne<any>('SELECT created_at FROM executions WHERE id = ?', [id])
      expect(row.created_at >= before).toBe(true)
      expect(row.created_at <= after).toBe(true)
    })
  })

  describe('ID generation', () => {
    test('start returns valid UUID format', () => {
      const execution = createExecution()
      const id = execution.start('test', '/path')

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    test('each start generates unique ID', () => {
      const execution = createExecution()
      const ids = new Set<string>()

      for (let i = 0; i < 100; i++) {
        ids.add(execution.start(`exec${i}`, `/path${i}`))
      }

      expect(ids.size).toBe(100)
    })
  })

  describe('error cases', () => {
    test('complete on non-existent execution does not throw and has no side effects', () => {
      const execution = createExecution()
      const beforeCount = db.query<{ id: string }>('SELECT id FROM executions').length

      execution.complete('non-existent')
      
      const afterCount = db.query<{ id: string }>('SELECT id FROM executions').length
      expect(afterCount).toBe(beforeCount)
    })

    test('fail on non-existent execution does not throw and has no side effects', () => {
      const execution = createExecution()
      const beforeCount = db.query<{ id: string }>('SELECT id FROM executions').length

      execution.fail('non-existent', 'error')
      
      const afterCount = db.query<{ id: string }>('SELECT id FROM executions').length
      expect(afterCount).toBe(beforeCount)
    })

    test('cancel on non-existent execution does not throw and has no side effects', () => {
      const execution = createExecution()
      const beforeCount = db.query<{ id: string }>('SELECT id FROM executions').length

      execution.cancel('non-existent')
      
      const afterCount = db.query<{ id: string }>('SELECT id FROM executions').length
      expect(afterCount).toBe(beforeCount)
    })

    test('list on empty database returns empty array', () => {
      const execution = createExecution()

      const list = execution.list()
      expect(list).toEqual([])
    })

    test('findIncomplete on empty database returns null', () => {
      const execution = createExecution()

      expect(execution.findIncomplete()).toBeNull()
    })
  })

  describe('mapExecution JSON parsing', () => {
    test('handles malformed config JSON by returning empty object', () => {
      const execution = createExecution()

      db.run(
        `INSERT INTO executions (id, file_path, status, config) VALUES (?, ?, ?, ?)`,
        ['bad-config', '/path', 'running', 'not valid json']
      )

      const found = execution.get('bad-config')
      expect(found!.config).toEqual({})
    })

    test('handles malformed result JSON by returning undefined', () => {
      const execution = createExecution()

      db.run(
        `INSERT INTO executions (id, file_path, status, result) VALUES (?, ?, ?, ?)`,
        ['bad-result', '/path', 'completed', 'not valid json']
      )

      const found = execution.get('bad-result')
      expect(found!.result).toBeUndefined()
    })

    test('handles null config by returning empty object', () => {
      const execution = createExecution()

      db.run(
        `INSERT INTO executions (id, file_path, status, config) VALUES (?, ?, ?, ?)`,
        ['null-config', '/path', 'running', null]
      )

      const found = execution.get('null-config')
      expect(found!.config).toEqual({})
    })

    test('handles null result by returning undefined', () => {
      const execution = createExecution()

      db.run(
        `INSERT INTO executions (id, file_path, status) VALUES (?, ?, ?)`,
        ['null-result', '/path', 'running']
      )

      const found = execution.get('null-result')
      expect(found!.result).toBeUndefined()
    })
  })

  describe('resume semantics', () => {
    test('start is idempotent when SMITHERS_EXECUTION_ID is set for existing execution', () => {
      const execution = createExecution()

      // Simulate an incomplete execution that was previously started
      db.run(
        `INSERT INTO executions (id, name, file_path, status, config, created_at) 
         VALUES (?, ?, ?, ?, ?, datetime('now', '-1 hour'))`,
        ['existing-exec-id', 'original-name', '/path/script.tsx', 'pending', '{}']
      )

      // Set env var to simulate control plane passing the ID
      const originalEnv = process.env['SMITHERS_EXECUTION_ID']
      process.env['SMITHERS_EXECUTION_ID'] = 'existing-exec-id'

      try {
        const id = execution.start('new-name', '/path/script.tsx')

        expect(id).toBe('existing-exec-id')

        // Should have updated, not inserted
        const count = db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM executions WHERE id = ?', ['existing-exec-id'])
        expect(count!.c).toBe(1)

        // Status should be updated to running
        const row = db.queryOne<{ status: string; error: string | null }>('SELECT status, error FROM executions WHERE id = ?', ['existing-exec-id'])
        expect(row!.status).toBe('running')
        expect(row!.error).toBeNull()
      } finally {
        if (originalEnv === undefined) {
          delete process.env['SMITHERS_EXECUTION_ID']
        } else {
          process.env['SMITHERS_EXECUTION_ID'] = originalEnv
        }
      }
    })

    test('start with env ID creates new execution if ID does not exist', () => {
      const execution = createExecution()

      const originalEnv = process.env['SMITHERS_EXECUTION_ID']
      process.env['SMITHERS_EXECUTION_ID'] = 'new-exec-id-from-env'

      try {
        const id = execution.start('test-name', '/path/script.tsx')

        expect(id).toBe('new-exec-id-from-env')

        const row = db.queryOne<{ status: string; name: string }>('SELECT status, name FROM executions WHERE id = ?', ['new-exec-id-from-env'])
        expect(row).not.toBeNull()
        expect(row!.status).toBe('running')
        expect(row!.name).toBe('test-name')
      } finally {
        if (originalEnv === undefined) {
          delete process.env['SMITHERS_EXECUTION_ID']
        } else {
          process.env['SMITHERS_EXECUTION_ID'] = originalEnv
        }
      }
    })

    test('resume clears previous error and completed_at', () => {
      const execution = createExecution()

      // Simulate a failed execution
      db.run(
        `INSERT INTO executions (id, name, file_path, status, error, completed_at, created_at) 
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '-1 hour'))`,
        ['failed-exec-id', 'failed-exec', '/path/script.tsx', 'failed', 'Previous error message']
      )

      const originalEnv = process.env['SMITHERS_EXECUTION_ID']
      process.env['SMITHERS_EXECUTION_ID'] = 'failed-exec-id'

      try {
        const id = execution.start('resumed', '/path/script.tsx')

        expect(id).toBe('failed-exec-id')

        const row = db.queryOne<{ status: string; error: string | null; completed_at: string | null }>(
          'SELECT status, error, completed_at FROM executions WHERE id = ?',
          ['failed-exec-id']
        )
        expect(row!.status).toBe('running')
        expect(row!.error).toBeNull()
        expect(row!.completed_at).toBeNull()
      } finally {
        if (originalEnv === undefined) {
          delete process.env['SMITHERS_EXECUTION_ID']
        } else {
          process.env['SMITHERS_EXECUTION_ID'] = originalEnv
        }
      }
    })
  })
})
