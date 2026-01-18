import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createAgentsModule } from './agents.js'

describe('AgentsModule', () => {
  let db: ReactiveDatabase
  
  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    // Setup schema
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
  })

  afterEach(() => {
    db.close()
  })

  it('should start agent and save logPath', () => {
    const executionId = 'test-execution-id'
    const phaseId = 'test-phase-id'
    
    // Create execution first
    db.run('INSERT INTO executions (id) VALUES (?)', [executionId])
    
    let currentAgentId: string | null = null
    const setCurrentAgentId = (id: string | null) => { currentAgentId = id }
    
    const agents = createAgentsModule({
      rdb: db,
      getCurrentExecutionId: () => executionId,
      getCurrentPhaseId: () => phaseId,
      getCurrentAgentId: () => currentAgentId,
      setCurrentAgentId
    })
    
    const prompt = 'test prompt'
    const logPath = '/path/to/log.txt'
    
    const agentId = agents.start(prompt, 'sonnet', undefined, logPath)
    
    expect(agentId).toBeDefined()
    expect(currentAgentId).toBe(agentId)
    
    const agent = db.queryOne<{ log_path: string }>('SELECT log_path FROM agents WHERE id = ?', [agentId])
    expect(agent).toBeDefined()
    expect(agent!.log_path).toBe(logPath)
  })

  it('should start agent without logPath', () => {
    const executionId = 'test-execution-id'
    const phaseId = 'test-phase-id'
    
    db.run('INSERT INTO executions (id) VALUES (?)', [executionId])
    
    let currentAgentId: string | null = null
    const setCurrentAgentId = (id: string | null) => { currentAgentId = id }
    
    const agents = createAgentsModule({
      rdb: db,
      getCurrentExecutionId: () => executionId,
      getCurrentPhaseId: () => phaseId,
      getCurrentAgentId: () => currentAgentId,
      setCurrentAgentId
    })
    
    const agentId = agents.start('test prompt')
    
    const agent = db.queryOne<{ log_path: string | null }>('SELECT log_path FROM agents WHERE id = ?', [agentId])
    expect(agent).toBeDefined()
    expect(agent!.log_path).toBeNull()
  })
})
