/**
 * Tests for tools module - tool call tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createToolsModule } from './tools.js'

describe('ToolsModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        total_tool_calls INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        execution_id TEXT,
        tool_calls_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        execution_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        output_inline TEXT,
        output_path TEXT,
        output_git_hash TEXT,
        output_summary TEXT,
        output_size_bytes INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        duration_ms INTEGER
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

  const createTools = () => {
    return createToolsModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId
    })
  }

  describe('start', () => {
    test('creates tool call with running status', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', { file_path: '/test.txt' })

      const toolCall = db.queryOne<{ id: string; status: string; tool_name: string; input: string }>(
        'SELECT * FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall).not.toBeNull()
      expect(toolCall!.status).toBe('running')
      expect(toolCall!.tool_name).toBe('Read')
      expect(JSON.parse(toolCall!.input)).toEqual({ file_path: '/test.txt' })
    })

    test('increments execution total_tool_calls counter', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id, total_tool_calls) VALUES (?, 0)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      tools.start('agent-1', 'Bash', { command: 'ls' })

      const execution = db.queryOne<{ total_tool_calls: number }>(
        'SELECT total_tool_calls FROM executions WHERE id = ?',
        [currentExecutionId]
      )

      expect(execution!.total_tool_calls).toBe(1)
    })

    test('increments agent tool_calls_count counter', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id, tool_calls_count) VALUES (?, ?, 0)', ['agent-1', currentExecutionId])

      const tools = createTools()
      tools.start('agent-1', 'Edit', { path: '/file.ts' })

      const agent = db.queryOne<{ tool_calls_count: number }>(
        'SELECT tool_calls_count FROM agents WHERE id = ?',
        ['agent-1']
      )

      expect(agent!.tool_calls_count).toBe(1)
    })

    test('throws without active execution', () => {
      currentExecutionId = null
      const tools = createTools()

      expect(() => tools.start('agent-1', 'Read', {})).toThrow('No active execution')
    })

    test('records started_at timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Grep', { pattern: 'test' })

      const toolCall = db.queryOne<{ started_at: string }>(
        'SELECT started_at FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.started_at).not.toBeNull()
    })
  })

  describe('complete', () => {
    test('stores small output inline (< 1024 bytes)', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', { file_path: '/test.txt' })

      const smallOutput = 'This is a small output'
      tools.complete(toolId, smallOutput)

      const toolCall = db.queryOne<{ output_inline: string; output_summary: string | null; status: string }>(
        'SELECT output_inline, output_summary, status FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.status).toBe('completed')
      expect(toolCall!.output_inline).toBe(smallOutput)
      expect(toolCall!.output_summary).toBeNull()
    })

    test('stores output exactly 1023 bytes inline', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', {})

      // Create output exactly 1023 bytes
      const output = 'x'.repeat(1023)
      tools.complete(toolId, output)

      const toolCall = db.queryOne<{ output_inline: string | null }>(
        'SELECT output_inline FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.output_inline).toBe(output)
    })

    test('stores output at 1024 bytes as summary only (boundary)', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', {})

      // Create output exactly 1024 bytes - should still be inline due to < check
      const output = 'x'.repeat(1024)
      tools.complete(toolId, output)

      const toolCall = db.queryOne<{ output_inline: string | null; output_summary: string | null }>(
        'SELECT output_inline, output_summary FROM tool_calls WHERE id = ?',
        [toolId]
      )

      // 1024 bytes is NOT < 1024, so it goes to summary
      expect(toolCall!.output_inline).toBeNull()
      expect(toolCall!.output_summary).not.toBeNull()
    })

    test('stores large output as summary only (> 1024 bytes)', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', {})

      const largeOutput = 'x'.repeat(2000)
      tools.complete(toolId, largeOutput)

      const toolCall = db.queryOne<{ output_inline: string | null; output_summary: string | null }>(
        'SELECT output_inline, output_summary FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.output_inline).toBeNull()
      expect(toolCall!.output_summary).not.toBeNull()
    })

    test('stores empty output (0 bytes) inline', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Bash', {})

      tools.complete(toolId, '')

      const toolCall = db.queryOne<{ output_inline: string | null; output_size_bytes: number }>(
        'SELECT output_inline, output_size_bytes FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.output_inline).toBe('')
      expect(toolCall!.output_size_bytes).toBe(0)
    })

    test('handles multi-byte UTF-8 characters in size calculation', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', {})

      // Unicode characters take more bytes than characters
      // 'x' repeated to make total bytes > 1024 even if char count < 1024
      const unicodeOutput = '\u{1F600}'.repeat(300) // Emoji takes 4 bytes each = 1200 bytes

      tools.complete(toolId, unicodeOutput)

      const toolCall = db.queryOne<{ output_size_bytes: number; output_inline: string | null }>(
        'SELECT output_size_bytes, output_inline FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.output_size_bytes).toBeGreaterThan(1000)
      expect(toolCall!.output_inline).toBeNull() // Should be stored as summary
    })

    test('uses provided summary when given', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', {})

      tools.complete(toolId, 'short output', 'Custom summary')

      const toolCall = db.queryOne<{ output_summary: string | null }>(
        'SELECT output_summary FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.output_summary).toBe('Custom summary')
    })

    test('auto-truncates to 200 chars for summary when not provided', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', {})

      const largeOutput = 'a'.repeat(2000)
      tools.complete(toolId, largeOutput) // No summary provided

      const toolCall = db.queryOne<{ output_summary: string | null }>(
        'SELECT output_summary FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.output_summary!.length).toBe(200)
    })

    test('calculates duration_ms correctly', async () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Bash', {})

      // Small delay to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 10))

      tools.complete(toolId, 'done')

      const toolCall = db.queryOne<{ duration_ms: number | null }>(
        'SELECT duration_ms FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.duration_ms).toBeGreaterThanOrEqual(0)
    })

    test('handles non-existent tool id gracefully', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      // Complete a tool that doesn't exist - should not throw
      // The startRow query returns null, so durationMs is null
      tools.complete('nonexistent-tool', 'output')

      // Verify no row was created (UPDATE on non-existent row does nothing)
      const toolCall = db.queryOne<{ id: string }>(
        'SELECT id FROM tool_calls WHERE id = ?',
        ['nonexistent-tool']
      )

      expect(toolCall).toBeNull()
    })
  })

  describe('fail', () => {
    test('sets error and completed_at', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Bash', { command: 'invalid' })

      tools.fail(toolId, 'Command not found')

      const toolCall = db.queryOne<{ status: string; error: string | null; completed_at: string | null }>(
        'SELECT status, error, completed_at FROM tool_calls WHERE id = ?',
        [toolId]
      )

      expect(toolCall!.status).toBe('failed')
      expect(toolCall!.error).toBe('Command not found')
      expect(toolCall!.completed_at).not.toBeNull()
    })
  })

  describe('list', () => {
    test('returns all tool calls for agent ordered by created_at', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const id1 = tools.start('agent-1', 'Read', { path: '/a.txt' })
      const id2 = tools.start('agent-1', 'Write', { path: '/b.txt' })
      const id3 = tools.start('agent-1', 'Bash', { command: 'ls' })

      const toolCalls = tools.list('agent-1')

      expect(toolCalls).toHaveLength(3)
      expect(toolCalls[0].id).toBe(id1)
      expect(toolCalls[1].id).toBe(id2)
      expect(toolCalls[2].id).toBe(id3)
    })

    test('returns empty array for agent with no tool calls', () => {
      const tools = createTools()
      const toolCalls = tools.list('nonexistent-agent')

      expect(toolCalls).toEqual([])
    })

    test('parses input JSON', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      tools.start('agent-1', 'Read', { file_path: '/test.txt', encoding: 'utf-8' })

      const toolCalls = tools.list('agent-1')

      expect(toolCalls[0].input).toEqual({ file_path: '/test.txt', encoding: 'utf-8' })
    })
  })

  describe('getOutput', () => {
    test('returns inline output', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', {})
      tools.complete(toolId, 'file contents here')

      const output = tools.getOutput(toolId)
      expect(output).toBe('file contents here')
    })

    test('returns null for large output (no inline)', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO agents (id, execution_id) VALUES (?, ?)', ['agent-1', currentExecutionId])

      const tools = createTools()
      const toolId = tools.start('agent-1', 'Read', {})
      tools.complete(toolId, 'x'.repeat(2000))

      const output = tools.getOutput(toolId)
      expect(output).toBeNull()
    })

    test('returns null for non-existent tool', () => {
      const tools = createTools()
      const output = tools.getOutput('nonexistent')
      expect(output).toBeNull()
    })
  })
})
