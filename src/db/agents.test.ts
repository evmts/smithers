import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createAgentsModule, type AgentsModule, type AgentsModuleContext } from './agents.js'

describe('AgentsModule', () => {
  let db: ReactiveDatabase
  let executionId: string
  let phaseId: string
  let currentAgentId: string | null
  let agents: AgentsModule

  const setupAgentsModule = (overrides: Partial<AgentsModuleContext> = {}): AgentsModule => {
    return createAgentsModule({
      rdb: db,
      getCurrentExecutionId: () => executionId,
      getCurrentPhaseId: () => phaseId,
      getCurrentAgentId: () => currentAgentId,
      setCurrentAgentId: (id: string | null) => { currentAgentId = id },
      ...overrides
    })
  }

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    executionId = 'test-execution-id'
    phaseId = 'test-phase-id'
    currentAgentId = null

    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        phase_id TEXT,
        model TEXT NOT NULL DEFAULT 'sonnet',
        system_prompt TEXT,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        result_structured TEXT,
        log_path TEXT,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        duration_ms INTEGER,
        tokens_input INTEGER,
        tokens_output INTEGER,
        tool_calls_count INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        total_agents INTEGER DEFAULT 0,
        total_tokens_used INTEGER DEFAULT 0
      );
    `)

    db.run('INSERT INTO executions (id) VALUES (?)', [executionId])
    agents = setupAgentsModule()
  })

  afterEach(() => {
    db.close()
  })

  // ============================================================================
  // start() tests
  // ============================================================================

  describe('start()', () => {
    it('returns valid UUID agent ID', () => {
      const agentId = agents.start('test prompt')
      expect(agentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('saves agent with all optional fields', () => {
      const logPath = '/path/to/log.txt'
      const systemPrompt = 'You are a helpful assistant'
      const model = 'opus'
      const prompt = 'test prompt'

      const agentId = agents.start(prompt, model, systemPrompt, logPath)

      const agent = db.queryOne<any>('SELECT * FROM agents WHERE id = ?', [agentId])
      expect(agent).toBeDefined()
      expect(agent!.model).toBe(model)
      expect(agent!.system_prompt).toBe(systemPrompt)
      expect(agent!.log_path).toBe(logPath)
      expect(agent!.prompt).toBe(prompt)
      expect(agent!.execution_id).toBe(executionId)
      expect(agent!.phase_id).toBe(phaseId)
    })

    it('uses default model when not provided', () => {
      const agentId = agents.start('test prompt')
      const agent = db.queryOne<any>('SELECT model FROM agents WHERE id = ?', [agentId])
      expect(agent!.model).toBe('sonnet')
    })

    it('sets status to running on start', () => {
      const agentId = agents.start('test prompt')
      const agent = db.queryOne<any>('SELECT status FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('running')
    })

    it('sets started_at and created_at timestamps', () => {
      const before = new Date().toISOString()
      const agentId = agents.start('test prompt')
      const after = new Date().toISOString()

      const agent = db.queryOne<any>('SELECT started_at, created_at FROM agents WHERE id = ?', [agentId])
      expect(agent!.started_at).toBeDefined()
      expect(agent!.created_at).toBeDefined()
      expect(agent!.started_at >= before).toBe(true)
      expect(agent!.started_at <= after).toBe(true)
    })

    it('increments execution total_agents counter', () => {
      const beforeExec = db.queryOne<any>('SELECT total_agents FROM executions WHERE id = ?', [executionId])
      expect(beforeExec!.total_agents).toBe(0)

      agents.start('test prompt 1')
      agents.start('test prompt 2')

      const afterExec = db.queryOne<any>('SELECT total_agents FROM executions WHERE id = ?', [executionId])
      expect(afterExec!.total_agents).toBe(2)
    })

    it('sets currentAgentId after start', () => {
      expect(currentAgentId).toBeNull()
      const agentId = agents.start('test prompt')
      expect(currentAgentId).toBe(agentId)
    })

    it('throws error when no active execution', () => {
      const noExecAgents = setupAgentsModule({ getCurrentExecutionId: () => null })
      expect(() => noExecAgents.start('test prompt')).toThrow('No active execution')
    })

    it('works with null phase_id', () => {
      const noPhasedAgents = setupAgentsModule({ getCurrentPhaseId: () => null })
      const agentId = noPhasedAgents.start('test prompt')
      const agent = db.queryOne<any>('SELECT phase_id FROM agents WHERE id = ?', [agentId])
      expect(agent!.phase_id).toBeNull()
    })

    it('handles very long prompt', () => {
      const longPrompt = 'x'.repeat(100000)
      const agentId = agents.start(longPrompt)
      const agent = db.queryOne<any>('SELECT prompt FROM agents WHERE id = ?', [agentId])
      expect(agent!.prompt).toBe(longPrompt)
      expect(agent!.prompt.length).toBe(100000)
    })

    it('handles special characters in prompt', () => {
      const specialPrompt = `Hello "world" with 'quotes', newlines\n\ttabs, unicode: 你好 🎉, and SQL injection: '); DROP TABLE agents;--`
      const agentId = agents.start(specialPrompt)
      const agent = db.queryOne<any>('SELECT prompt FROM agents WHERE id = ?', [agentId])
      expect(agent!.prompt).toBe(specialPrompt)
    })

    it('handles empty prompt', () => {
      const agentId = agents.start('')
      const agent = db.queryOne<any>('SELECT prompt FROM agents WHERE id = ?', [agentId])
      expect(agent!.prompt).toBe('')
    })

    it('returns UUID when database is closed', () => {
      db.close()
      const agentId = agents.start('test prompt')
      expect(agentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })
  })

  // ============================================================================
  // complete() tests
  // ============================================================================

  describe('complete()', () => {
    it('sets status to completed', () => {
      const agentId = agents.start('test prompt')
      agents.complete(agentId, 'success result')

      const agent = db.queryOne<any>('SELECT status FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('completed')
    })

    it('stores result string', () => {
      const agentId = agents.start('test prompt')
      const result = 'This is the result'
      agents.complete(agentId, result)

      const agent = db.queryOne<any>('SELECT result FROM agents WHERE id = ?', [agentId])
      expect(agent!.result).toBe(result)
    })

    it('stores structured result as JSON', () => {
      const agentId = agents.start('test prompt')
      const structured = { key: 'value', nested: { a: 1 } }
      agents.complete(agentId, 'result', structured)

      const agent = db.queryOne<any>('SELECT result_structured FROM agents WHERE id = ?', [agentId])
      expect(JSON.parse(agent!.result_structured)).toEqual(structured)
    })

    it('stores tokens input and output', () => {
      const agentId = agents.start('test prompt')
      const tokens = { input: 1000, output: 500 }
      agents.complete(agentId, 'result', undefined, tokens)

      const agent = db.queryOne<any>('SELECT tokens_input, tokens_output FROM agents WHERE id = ?', [agentId])
      expect(agent!.tokens_input).toBe(1000)
      expect(agent!.tokens_output).toBe(500)
    })

    it('updates execution total_tokens_used', () => {
      const agentId = agents.start('test prompt')
      const tokens = { input: 1000, output: 500 }
      agents.complete(agentId, 'result', undefined, tokens)

      const exec = db.queryOne<any>('SELECT total_tokens_used FROM executions WHERE id = ?', [executionId])
      expect(exec!.total_tokens_used).toBe(1500)
    })

    it('calculates duration_ms', async () => {
      const agentId = agents.start('test prompt')
      await new Promise(r => setTimeout(r, 50)) // Wait 50ms
      agents.complete(agentId, 'result')

      const agent = db.queryOne<any>('SELECT duration_ms FROM agents WHERE id = ?', [agentId])
      expect(agent!.duration_ms).toBeGreaterThanOrEqual(45) // Allow some tolerance
    })

    it('sets completed_at timestamp', () => {
      const agentId = agents.start('test prompt')
      const before = new Date().toISOString()
      agents.complete(agentId, 'result')
      const after = new Date().toISOString()

      const agent = db.queryOne<any>('SELECT completed_at FROM agents WHERE id = ?', [agentId])
      expect(agent!.completed_at).toBeDefined()
      expect(agent!.completed_at >= before).toBe(true)
      expect(agent!.completed_at <= after).toBe(true)
    })

    it('clears currentAgentId when completing current agent', () => {
      const agentId = agents.start('test prompt')
      expect(currentAgentId).toBe(agentId)
      agents.complete(agentId, 'result')
      expect(currentAgentId).toBeNull()
    })

    it('does not clear currentAgentId when completing different agent', () => {
      const agentId1 = agents.start('test prompt 1')
      const agentId2 = agents.start('test prompt 2')
      expect(currentAgentId).toBe(agentId2)
      agents.complete(agentId1, 'result')
      expect(currentAgentId).toBe(agentId2)
    })

    it('handles complete on non-existent agent gracefully', () => {
      expect(() => agents.complete('non-existent-id', 'result')).not.toThrow()
    })

    it('handles complete with undefined structured result', () => {
      const agentId = agents.start('test prompt')
      agents.complete(agentId, 'result', undefined)

      const agent = db.queryOne<any>('SELECT result_structured FROM agents WHERE id = ?', [agentId])
      expect(agent!.result_structured).toBeNull()
    })

    it('handles complete with undefined tokens', () => {
      const agentId = agents.start('test prompt')
      agents.complete(agentId, 'result', undefined, undefined)

      const agent = db.queryOne<any>('SELECT tokens_input, tokens_output FROM agents WHERE id = ?', [agentId])
      expect(agent!.tokens_input).toBeNull()
      expect(agent!.tokens_output).toBeNull()
    })

    it('no-ops when database is closed', () => {
      const agentId = agents.start('test prompt')
      db.close()
      expect(() => agents.complete(agentId, 'result')).not.toThrow()
    })
  })

  // ============================================================================
  // fail() tests
  // ============================================================================

  describe('fail()', () => {
    it('sets status to failed', () => {
      const agentId = agents.start('test prompt')
      agents.fail(agentId, 'error message')

      const agent = db.queryOne<any>('SELECT status FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('failed')
    })

    it('stores error message', () => {
      const agentId = agents.start('test prompt')
      const errorMsg = 'Something went wrong'
      agents.fail(agentId, errorMsg)

      const agent = db.queryOne<any>('SELECT error FROM agents WHERE id = ?', [agentId])
      expect(agent!.error).toBe(errorMsg)
    })

    it('sets completed_at timestamp', () => {
      const agentId = agents.start('test prompt')
      const before = new Date().toISOString()
      agents.fail(agentId, 'error')
      const after = new Date().toISOString()

      const agent = db.queryOne<any>('SELECT completed_at FROM agents WHERE id = ?', [agentId])
      expect(agent!.completed_at).toBeDefined()
      expect(agent!.completed_at >= before).toBe(true)
      expect(agent!.completed_at <= after).toBe(true)
    })

    it('clears currentAgentId when failing current agent', () => {
      const agentId = agents.start('test prompt')
      expect(currentAgentId).toBe(agentId)
      agents.fail(agentId, 'error')
      expect(currentAgentId).toBeNull()
    })

    it('does not clear currentAgentId when failing different agent', () => {
      const agentId1 = agents.start('test prompt 1')
      const agentId2 = agents.start('test prompt 2')
      expect(currentAgentId).toBe(agentId2)
      agents.fail(agentId1, 'error')
      expect(currentAgentId).toBe(agentId2)
    })

    it('handles fail on non-existent agent gracefully', () => {
      expect(() => agents.fail('non-existent-id', 'error')).not.toThrow()
    })

    it('handles error message with special characters', () => {
      const agentId = agents.start('test prompt')
      const errorMsg = `Error: "quotes" and 'apostrophes'\n\tStack trace: file.ts:10\n日本語 🔥`
      agents.fail(agentId, errorMsg)

      const agent = db.queryOne<any>('SELECT error FROM agents WHERE id = ?', [agentId])
      expect(agent!.error).toBe(errorMsg)
    })

    it('no-ops when database is closed', () => {
      const agentId = agents.start('test prompt')
      db.close()
      expect(() => agents.fail(agentId, 'error')).not.toThrow()
    })
  })

  // ============================================================================
  // current() tests
  // ============================================================================

  describe('current()', () => {
    it('returns null when no current agent', () => {
      expect(agents.current()).toBeNull()
    })

    it('returns current agent after start', () => {
      const agentId = agents.start('test prompt')
      const current = agents.current()

      expect(current).not.toBeNull()
      expect(current!.id).toBe(agentId)
      expect(current!.prompt).toBe('test prompt')
    })

    it('returns null after agent is completed', () => {
      const agentId = agents.start('test prompt')
      agents.complete(agentId, 'result')
      expect(agents.current()).toBeNull()
    })

    it('returns null after agent is failed', () => {
      const agentId = agents.start('test prompt')
      agents.fail(agentId, 'error')
      expect(agents.current()).toBeNull()
    })

    it('returns most recently started agent', () => {
      agents.start('prompt 1')
      const agentId2 = agents.start('prompt 2')
      const current = agents.current()

      expect(current!.id).toBe(agentId2)
      expect(current!.prompt).toBe('prompt 2')
    })

    it('parses result_structured JSON', () => {
      const agentId = agents.start('test prompt')
      const structured = { key: 'value' }
      db.run('UPDATE agents SET result_structured = ? WHERE id = ?', [JSON.stringify(structured), agentId])

      const current = agents.current()
      expect(current!.result_structured).toEqual(structured)
    })

    it('handles invalid JSON in result_structured', () => {
      const agentId = agents.start('test prompt')
      db.run('UPDATE agents SET result_structured = ? WHERE id = ?', ['invalid json', agentId])

      const current = agents.current()
      expect(current!.result_structured).toBeUndefined()
    })

    it('returns null when database is closed', () => {
      agents.start('test prompt')
      db.close()
      expect(agents.current()).toBeNull()
    })
  })

  // ============================================================================
  // list() tests
  // ============================================================================

  describe('list()', () => {
    it('returns empty array when no agents', () => {
      const result = agents.list(executionId)
      expect(result).toEqual([])
    })

    it('returns agents for execution', () => {
      const id1 = agents.start('prompt 1')
      const id2 = agents.start('prompt 2')

      const result = agents.list(executionId)
      expect(result.length).toBe(2)
      expect(result.map(a => a.id)).toContain(id1)
      expect(result.map(a => a.id)).toContain(id2)
    })

    it('returns agents ordered by created_at', async () => {
      const id1 = agents.start('prompt 1')
      await new Promise(r => setTimeout(r, 10))
      const id2 = agents.start('prompt 2')
      await new Promise(r => setTimeout(r, 10))
      const id3 = agents.start('prompt 3')

      const result = agents.list(executionId)
      expect(result[0].id).toBe(id1)
      expect(result[1].id).toBe(id2)
      expect(result[2].id).toBe(id3)
    })

    it('filters by execution_id', () => {
      agents.start('prompt for exec 1')

      // Create a second execution and agent
      const exec2 = 'execution-2'
      db.run('INSERT INTO executions (id) VALUES (?)', [exec2])
      const agents2 = setupAgentsModule({ getCurrentExecutionId: () => exec2 })
      agents2.start('prompt for exec 2')

      const result1 = agents.list(executionId)
      const result2 = agents.list(exec2)

      expect(result1.length).toBe(1)
      expect(result1[0].prompt).toBe('prompt for exec 1')
      expect(result2.length).toBe(1)
      expect(result2[0].prompt).toBe('prompt for exec 2')
    })

    it('returns empty array for non-existent execution', () => {
      agents.start('test prompt')
      const result = agents.list('non-existent-execution')
      expect(result).toEqual([])
    })

    it('includes all agent statuses', () => {
      agents.start('running')
      const id2 = agents.start('completed')
      agents.complete(id2, 'done')
      const id3 = agents.start('failed')
      agents.fail(id3, 'error')

      const result = agents.list(executionId)
      expect(result.length).toBe(3)

      const statuses = result.map(a => a.status)
      expect(statuses).toContain('running')
      expect(statuses).toContain('completed')
      expect(statuses).toContain('failed')
    })

    it('parses result_structured for each agent', () => {
      const id1 = agents.start('prompt 1')
      const id2 = agents.start('prompt 2')
      agents.complete(id1, 'result', { key1: 'value1' })
      agents.complete(id2, 'result', { key2: 'value2' })

      const result = agents.list(executionId)
      const agent1 = result.find(a => a.id === id1)
      const agent2 = result.find(a => a.id === id2)

      expect(agent1!.result_structured).toEqual({ key1: 'value1' })
      expect(agent2!.result_structured).toEqual({ key2: 'value2' })
    })

    it('returns empty array when database is closed', () => {
      agents.start('test prompt')
      db.close()
      expect(agents.list(executionId)).toEqual([])
    })
  })

  // ============================================================================
  // Agent lifecycle tests
  // ============================================================================

  describe('agent lifecycle', () => {
    it('pending -> running -> completed', () => {
      const agentId = agents.start('test prompt')

      // After start, status is running
      let agent = db.queryOne<any>('SELECT status FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('running')

      // Complete the agent
      agents.complete(agentId, 'success')
      agent = db.queryOne<any>('SELECT status FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('completed')
    })

    it('pending -> running -> failed', () => {
      const agentId = agents.start('test prompt')

      // After start, status is running
      let agent = db.queryOne<any>('SELECT status FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('running')

      // Fail the agent
      agents.fail(agentId, 'error occurred')
      agent = db.queryOne<any>('SELECT status FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('failed')
    })

    it('tracks full agent metadata through lifecycle', () => {
      const prompt = 'Complex task'
      const model = 'opus'
      const systemPrompt = 'You are an expert'
      const logPath = '/logs/agent.log'

      const agentId = agents.start(prompt, model, systemPrompt, logPath)

      // Verify initial state
      let agent = db.queryOne<any>('SELECT * FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('running')
      expect(agent!.prompt).toBe(prompt)
      expect(agent!.model).toBe(model)
      expect(agent!.system_prompt).toBe(systemPrompt)
      expect(agent!.log_path).toBe(logPath)
      expect(agent!.started_at).toBeDefined()
      expect(agent!.result).toBeNull()
      expect(agent!.error).toBeNull()

      // Complete with structured result and tokens
      const structured = { output: 'data', metrics: { accuracy: 0.95 } }
      const tokens = { input: 5000, output: 2000 }
      agents.complete(agentId, 'Task completed successfully', structured, tokens)

      // Verify final state
      agent = db.queryOne<any>('SELECT * FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('completed')
      expect(agent!.result).toBe('Task completed successfully')
      expect(JSON.parse(agent!.result_structured)).toEqual(structured)
      expect(agent!.tokens_input).toBe(5000)
      expect(agent!.tokens_output).toBe(2000)
      expect(agent!.completed_at).toBeDefined()
      expect(agent!.duration_ms).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================================================
  // Concurrent agent tests
  // ============================================================================

  describe('concurrent agents', () => {
    it('supports multiple concurrent agents', () => {
      const ids = []
      for (let i = 0; i < 10; i++) {
        ids.push(agents.start(`prompt ${i}`))
      }

      const result = agents.list(executionId)
      expect(result.length).toBe(10)
      expect(new Set(result.map(a => a.id)).size).toBe(10) // All unique
    })

    it('correctly tracks current agent with concurrent starts', () => {
      const id1 = agents.start('prompt 1')
      expect(currentAgentId).toBe(id1)

      const id2 = agents.start('prompt 2')
      expect(currentAgentId).toBe(id2)

      const id3 = agents.start('prompt 3')
      expect(currentAgentId).toBe(id3)

      // Complete middle agent
      agents.complete(id2, 'done')
      expect(currentAgentId).toBe(id3) // Still id3

      // Complete current agent
      agents.complete(id3, 'done')
      expect(currentAgentId).toBeNull()
    })

    it('aggregates tokens across multiple agents', () => {
      const id1 = agents.start('prompt 1')
      agents.complete(id1, 'result', undefined, { input: 100, output: 50 })

      const id2 = agents.start('prompt 2')
      agents.complete(id2, 'result', undefined, { input: 200, output: 100 })

      const id3 = agents.start('prompt 3')
      agents.complete(id3, 'result', undefined, { input: 300, output: 150 })

      const exec = db.queryOne<any>('SELECT total_tokens_used FROM executions WHERE id = ?', [executionId])
      expect(exec!.total_tokens_used).toBe(900) // 150 + 300 + 450
    })
  })

  // ============================================================================
  // Edge cases
  // ============================================================================

  describe('edge cases', () => {
    it('handles null values in optional fields', () => {
      const agentId = agents.start('test')
      agents.complete(agentId, 'result')

      const agent = db.queryOne<any>('SELECT * FROM agents WHERE id = ?', [agentId])
      expect(agent!.system_prompt).toBeNull()
      expect(agent!.log_path).toBeNull()
      expect(agent!.error).toBeNull()
    })

    it('handles very large structured result', () => {
      const agentId = agents.start('test')
      const largeStructured: Record<string, string> = {}
      for (let i = 0; i < 1000; i++) {
        largeStructured[`key${i}`] = 'x'.repeat(100)
      }
      agents.complete(agentId, 'result', largeStructured)

      const agent = db.queryOne<any>('SELECT result_structured FROM agents WHERE id = ?', [agentId])
      expect(JSON.parse(agent!.result_structured)).toEqual(largeStructured)
    })

    it('handles zero tokens', () => {
      const agentId = agents.start('test')
      agents.complete(agentId, 'result', undefined, { input: 0, output: 0 })

      const agent = db.queryOne<any>('SELECT tokens_input, tokens_output FROM agents WHERE id = ?', [agentId])
      expect(agent!.tokens_input).toBe(0)
      expect(agent!.tokens_output).toBe(0)
    })

    it('handles multiple complete calls on same agent', () => {
      const agentId = agents.start('test')
      agents.complete(agentId, 'result1')
      agents.complete(agentId, 'result2') // Should overwrite

      const agent = db.queryOne<any>('SELECT result FROM agents WHERE id = ?', [agentId])
      expect(agent!.result).toBe('result2')
    })

    it('handles fail after complete', () => {
      const agentId = agents.start('test')
      agents.complete(agentId, 'result')
      agents.fail(agentId, 'error') // Should overwrite

      const agent = db.queryOne<any>('SELECT status, error FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('failed')
      expect(agent!.error).toBe('error')
    })

    it('handles complete after fail', () => {
      const agentId = agents.start('test')
      agents.fail(agentId, 'error')
      agents.complete(agentId, 'result') // Should overwrite

      const agent = db.queryOne<any>('SELECT status, result FROM agents WHERE id = ?', [agentId])
      expect(agent!.status).toBe('completed')
      expect(agent!.result).toBe('result')
    })
  })
})
