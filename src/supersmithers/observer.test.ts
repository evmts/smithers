import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { collectMetrics, collectErrors, detectStall } from './observer.js'
import type { SmithersDB } from '../db/index.js'

describe('SuperSmithers Observer', () => {
  let rdb: ReactiveDatabase
  let mockDb: SmithersDB
  const executionId = 'exec-123'

  beforeEach(() => {
    rdb = new ReactiveDatabase(':memory:')
    
    rdb.exec(`
      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        tokens_input INTEGER,
        tokens_output INTEGER,
        error TEXT,
        prompt TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE tool_calls (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        tool_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE phases (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        duration_ms INTEGER
      );
      
      CREATE TABLE render_frames (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        tree_xml TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
    
    mockDb = { db: rdb } as SmithersDB
  })

  afterEach(() => {
    rdb.close()
  })

  describe('collectMetrics', () => {
    test('returns zero metrics for empty execution', () => {
      const metrics = collectMetrics(mockDb, executionId, 1)
      
      expect(metrics.tokensInput).toBe(0)
      expect(metrics.tokensOutput).toBe(0)
      expect(metrics.agentCount).toBe(0)
      expect(metrics.errorCount).toBe(0)
      expect(metrics.stallCount).toBe(0)
      expect(metrics.isStalled).toBe(false)
      expect(metrics.avgIterationTimeMs).toBe(0)
    })

    test('aggregates token usage across agents', () => {
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, tokens_input, tokens_output) VALUES (?, ?, ?, ?, ?)',
        ['a1', executionId, 'completed', 1000, 500]
      )
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, tokens_input, tokens_output) VALUES (?, ?, ?, ?, ?)',
        ['a2', executionId, 'completed', 2000, 1000]
      )
      
      const metrics = collectMetrics(mockDb, executionId, 1)
      
      expect(metrics.tokensInput).toBe(3000)
      expect(metrics.tokensOutput).toBe(1500)
      expect(metrics.agentCount).toBe(2)
    })

    test('counts failed agents as errors', () => {
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, error) VALUES (?, ?, ?, ?)',
        ['a1', executionId, 'failed', 'some error']
      )
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, error) VALUES (?, ?, ?, ?)',
        ['a2', executionId, 'failed', 'another error']
      )
      rdb.run(
        'INSERT INTO agents (id, execution_id, status) VALUES (?, ?, ?)',
        ['a3', executionId, 'completed']
      )
      
      const metrics = collectMetrics(mockDb, executionId, 1)
      expect(metrics.errorCount).toBe(2)
    })

    test('counts failed tool calls as errors', () => {
      rdb.run(
        'INSERT INTO tool_calls (id, execution_id, tool_name, status, error) VALUES (?, ?, ?, ?, ?)',
        ['t1', executionId, 'read_file', 'failed', 'file not found']
      )
      
      const metrics = collectMetrics(mockDb, executionId, 1)
      expect(metrics.errorCount).toBe(1)
    })

    test('combines agent and tool errors', () => {
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, error) VALUES (?, ?, ?, ?)',
        ['a1', executionId, 'failed', 'agent error']
      )
      rdb.run(
        'INSERT INTO tool_calls (id, execution_id, tool_name, status, error) VALUES (?, ?, ?, ?, ?)',
        ['t1', executionId, 'write_file', 'failed', 'permission denied']
      )
      
      const metrics = collectMetrics(mockDb, executionId, 1)
      expect(metrics.errorCount).toBe(2)
    })

    test('calculates average iteration time from phases', () => {
      rdb.run(
        'INSERT INTO phases (id, execution_id, duration_ms) VALUES (?, ?, ?)',
        ['p1', executionId, 1000]
      )
      rdb.run(
        'INSERT INTO phases (id, execution_id, duration_ms) VALUES (?, ?, ?)',
        ['p2', executionId, 2000]
      )
      rdb.run(
        'INSERT INTO phases (id, execution_id, duration_ms) VALUES (?, ?, ?)',
        ['p3', executionId, 3000]
      )
      
      const metrics = collectMetrics(mockDb, executionId, 1)
      expect(metrics.avgIterationTimeMs).toBe(2000)
    })

    test('only counts tokens for specified execution', () => {
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, tokens_input, tokens_output) VALUES (?, ?, ?, ?, ?)',
        ['a1', executionId, 'completed', 1000, 500]
      )
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, tokens_input, tokens_output) VALUES (?, ?, ?, ?, ?)',
        ['a2', 'other-exec', 'completed', 9999, 9999]
      )
      
      const metrics = collectMetrics(mockDb, executionId, 1)
      expect(metrics.tokensInput).toBe(1000)
      expect(metrics.tokensOutput).toBe(500)
    })
  })

  describe('collectErrors', () => {
    test('returns empty array when no errors', () => {
      const errors = collectErrors(mockDb, executionId)
      expect(errors).toEqual([])
    })

    test('collects failed agent errors', () => {
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, error, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['a1', executionId, 'failed', 'Task failed', 'do something', '2024-01-01 12:00:00']
      )
      
      const errors = collectErrors(mockDb, executionId)
      expect(errors.length).toBe(1)
      expect(errors[0].kind).toBe('agent')
      expect(errors[0].message).toBe('Task failed')
      expect(errors[0].signature).toMatch(/^sig_/)
    })

    test('collects failed tool errors', () => {
      rdb.run(
        'INSERT INTO tool_calls (id, execution_id, tool_name, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['t1', executionId, 'read_file', 'failed', 'File not found', '2024-01-01 12:00:00']
      )
      
      const errors = collectErrors(mockDb, executionId)
      expect(errors.length).toBe(1)
      expect(errors[0].kind).toBe('tool')
      expect(errors[0].message).toBe('File not found')
    })

    test('limits to 10 most recent errors', () => {
      for (let i = 0; i < 15; i++) {
        rdb.run(
          'INSERT INTO agents (id, execution_id, status, error, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [`a${i}`, executionId, 'failed', `Error ${i}`, 'prompt', `2024-01-01 12:${i.toString().padStart(2, '0')}:00`]
        )
      }
      
      const errors = collectErrors(mockDb, executionId)
      expect(errors.length).toBe(10)
    })

    test('sorts errors by timestamp descending', () => {
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, error, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['a1', executionId, 'failed', 'Old error', 'prompt', '2024-01-01 10:00:00']
      )
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, error, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['a2', executionId, 'failed', 'New error', 'prompt', '2024-01-01 12:00:00']
      )
      
      const errors = collectErrors(mockDb, executionId)
      expect(errors[0].message).toBe('New error')
      expect(errors[1].message).toBe('Old error')
    })

    test('only collects errors for specified execution', () => {
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, error, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['a1', executionId, 'failed', 'My error', 'prompt', '2024-01-01 12:00:00']
      )
      rdb.run(
        'INSERT INTO agents (id, execution_id, status, error, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['a2', 'other-exec', 'failed', 'Other error', 'prompt', '2024-01-01 12:00:00']
      )
      
      const errors = collectErrors(mockDb, executionId)
      expect(errors.length).toBe(1)
      expect(errors[0].message).toBe('My error')
    })
  })

  describe('detectStall', () => {
    test('returns false when insufficient frames', () => {
      rdb.run(
        'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES (?, ?, ?, ?)',
        ['f1', executionId, 1, '<tree>a</tree>']
      )
      rdb.run(
        'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES (?, ?, ?, ?)',
        ['f2', executionId, 2, '<tree>a</tree>']
      )
      
      const isStalled = detectStall(mockDb, executionId, 3)
      expect(isStalled).toBe(false)
    })

    test('returns true when all recent frames are identical', () => {
      for (let i = 1; i <= 5; i++) {
        rdb.run(
          'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES (?, ?, ?, ?)',
          [`f${i}`, executionId, i, '<tree>same</tree>']
        )
      }
      
      const isStalled = detectStall(mockDb, executionId, 3)
      expect(isStalled).toBe(true)
    })

    test('returns false when frames differ and recent agent activity exists', () => {
      rdb.run(
        'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES (?, ?, ?, ?)',
        ['f1', executionId, 1, '<tree>a</tree>']
      )
      rdb.run(
        'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES (?, ?, ?, ?)',
        ['f2', executionId, 2, '<tree>b</tree>']
      )
      rdb.run(
        'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES (?, ?, ?, ?)',
        ['f3', executionId, 3, '<tree>c</tree>']
      )
      rdb.run(
        "INSERT INTO agents (id, execution_id, status, created_at) VALUES (?, ?, ?, datetime('now'))",
        ['a1', executionId, 'running']
      )
      
      const isStalled = detectStall(mockDb, executionId, 3)
      expect(isStalled).toBe(false)
    })

    test('uses custom threshold', () => {
      for (let i = 1; i <= 5; i++) {
        rdb.run(
          'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES (?, ?, ?, ?)',
          [`f${i}`, executionId, i, '<tree>same</tree>']
        )
      }
      
      const stalledWith3 = detectStall(mockDb, executionId, 3)
      const stalledWith10 = detectStall(mockDb, executionId, 10)
      
      expect(stalledWith3).toBe(true)
      expect(stalledWith10).toBe(false)
    })

    test('checks recent agent activity for stall detection', () => {
      for (let i = 1; i <= 3; i++) {
        rdb.run(
          'INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml) VALUES (?, ?, ?, ?)',
          [`f${i}`, executionId, i, `<tree>${i}</tree>`]
        )
      }
      
      const isStalled = detectStall(mockDb, executionId, 3)
      expect(isStalled).toBe(true)
    })
  })
})
