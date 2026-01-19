/**
 * Tests for index module - SmithersDB factory and integration
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { createSmithersDB, type SmithersDB, ReactiveDatabase, useQuery, useMutation, useQueryOne, useQueryValue } from './index.js'

describe('createSmithersDB', () => {
  let db: SmithersDB | null = null

  afterEach(() => {
    if (db) {
      db.close()
      db = null
    }
  })

  describe('Factory creation', () => {
    test('creates SmithersDB with in-memory database by default', () => {
      db = createSmithersDB()
      expect(db).toBeDefined()
      expect(db.db).toBeInstanceOf(ReactiveDatabase)
    })

    test('creates SmithersDB with specified path', () => {
      const testPath = '/tmp/test-smithers-db-' + Date.now() + '.sqlite'
      db = createSmithersDB({ path: testPath })
      expect(db).toBeDefined()
      db.close()
      db = null
      const { unlinkSync } = require('fs')
      try { unlinkSync(testPath) } catch {}
    })

    test('creates SmithersDB with reset option', () => {
      db = createSmithersDB()
      db.execution.start('test-workflow', 'test.tsx')
      const countBefore = db.query<{ c: number }>('SELECT COUNT(*) as c FROM executions')[0].c
      expect(countBefore).toBe(1)
      db.close()
      
      db = createSmithersDB({ reset: true })
      const countAfter = db.query<{ c: number }>('SELECT COUNT(*) as c FROM executions')[0].c
      expect(countAfter).toBe(0)
    })

    test('initializes all modules', () => {
      db = createSmithersDB()
      expect(db.state).toBeDefined()
      expect(db.memories).toBeDefined()
      expect(db.execution).toBeDefined()
      expect(db.phases).toBeDefined()
      expect(db.agents).toBeDefined()
      expect(db.steps).toBeDefined()
      expect(db.tasks).toBeDefined()
      expect(db.tools).toBeDefined()
      expect(db.artifacts).toBeDefined()
      expect(db.human).toBeDefined()
      expect(db.vcs).toBeDefined()
      expect(db.renderFrames).toBeDefined()
      expect(db.query).toBeDefined()
    })

    test('exposes raw db property', () => {
      db = createSmithersDB()
      expect(db.db).toBeDefined()
      expect(typeof db.db.exec).toBe('function')
      expect(typeof db.db.run).toBe('function')
      expect(typeof db.db.query).toBe('function')
    })
  })

  describe('Schema initialization', () => {
    test('creates all required tables', () => {
      db = createSmithersDB()
      const tables = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      const tableNames = tables.map(t => t.name)
      
      expect(tableNames).toContain('executions')
      expect(tableNames).toContain('phases')
      expect(tableNames).toContain('agents')
      expect(tableNames).toContain('steps')
      expect(tableNames).toContain('tasks')
      expect(tableNames).toContain('state')
      expect(tableNames).toContain('memories')
      expect(tableNames).toContain('artifacts')
      expect(tableNames).toContain('human_interactions')
      expect(tableNames).toContain('render_frames')
    })

    test('creates all required indexes', () => {
      db = createSmithersDB()
      const indexes = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
      expect(indexes.length).toBeGreaterThan(0)
    })

    test('initializes default state values', () => {
      db = createSmithersDB()
      const paused = db.state.get('is_paused')
      expect(paused).toBeDefined()
    })
  })

  describe('Migration handling', () => {
    test('runMigrations adds log_path column if missing', () => {
      db = createSmithersDB()
      const columns = db.query<{ name: string }>('PRAGMA table_info(agents)')
      const hasLogPath = columns.some(c => c.name === 'log_path')
      expect(hasLogPath).toBe(true)
    })

    test('runMigrations does not fail if log_path exists', () => {
      db = createSmithersDB()
      db.close()
      db = createSmithersDB()
      expect(db).toBeDefined()
    })
  })

  describe('Reset behavior', () => {
    test('reset drops all tables before recreating', () => {
      db = createSmithersDB()
      db.execution.start('test', 'test.tsx')
      db.close()
      
      db = createSmithersDB({ reset: true })
      const count = db.query<{ c: number }>('SELECT COUNT(*) as c FROM executions')[0].c
      expect(count).toBe(0)
    })

    test('reset clears all data', () => {
      db = createSmithersDB()
      db.execution.start('test', 'test.tsx')
      db.state.set('test_key', 'test_value')
      db.close()
      
      db = createSmithersDB({ reset: true })
      expect(db.state.get('test_key')).toBe(null)
    })

    test('reset recreates default state', () => {
      db = createSmithersDB({ reset: true })
      const paused = db.state.get('is_paused')
      expect(paused).toBeDefined()
    })
  })

  describe('Module integration', () => {
    test('state module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.state.get).toBe('function')
      expect(typeof db.state.set).toBe('function')
    })

    test('memories module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.memories.add).toBe('function')
      expect(typeof db.memories.search).toBe('function')
    })

    test('execution module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.execution.start).toBe('function')
      expect(typeof db.execution.complete).toBe('function')
    })

    test('phases module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.phases.start).toBe('function')
      expect(typeof db.phases.complete).toBe('function')
    })

    test('agents module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.agents.start).toBe('function')
      expect(typeof db.agents.complete).toBe('function')
    })

    test('steps module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.steps.start).toBe('function')
      expect(typeof db.steps.complete).toBe('function')
    })

    test('tasks module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.tasks.start).toBe('function')
      expect(typeof db.tasks.complete).toBe('function')
    })

    test('tools module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.tools.start).toBe('function')
      expect(typeof db.tools.complete).toBe('function')
    })

    test('artifacts module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.artifacts.add).toBe('function')
      expect(typeof db.artifacts.list).toBe('function')
    })

    test('human module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.human.request).toBe('function')
      expect(typeof db.human.resolve).toBe('function')
    })

    test('vcs module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.vcs.logCommit).toBe('function')
      expect(typeof db.vcs.addReport).toBe('function')
    })

    test('renderFrames module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.renderFrames.store).toBe('function')
      expect(typeof db.renderFrames.list).toBe('function')
    })

    test('query function is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.query).toBe('function')
      const result = db.query<{ value: number }>('SELECT 1 as value')
      expect(result[0].value).toBe(1)
    })
  })

  describe('Close behavior', () => {
    test('close closes underlying database', () => {
      db = createSmithersDB()
      db.close()
      expect(db.db.isClosed).toBe(true)
      db = null
    })

    test('modules return safe defaults after close', () => {
      db = createSmithersDB()
      db.execution.start('test', 'test.tsx')
      db.close()
      expect(db.renderFrames.list()).toEqual([])
      db = null
    })
  })

  describe('Context sharing', () => {
    test('modules share execution context', () => {
      db = createSmithersDB()
      const execId = db.execution.start('test', 'test.tsx')
      const phaseId = db.phases.start('phase1', 0)
      
      const phase = db.query<{ execution_id: string }>('SELECT execution_id FROM phases WHERE id = ?', [phaseId])
      expect(phase[0].execution_id).toBe(execId)
    })

    test('modules share phase context', async () => {
      db = createSmithersDB()
      db.execution.start('test', 'test.tsx')
      const phaseId = db.phases.start('phase1', 0)
      const agentId = await db.agents.start('test prompt', 'sonnet')
      
      const agent = db.query<{ phase_id: string }>('SELECT phase_id FROM agents WHERE id = ?', [agentId])
      expect(agent[0].phase_id).toBe(phaseId)
    })
  })

  describe('Re-exports', () => {
    test('re-exports ReactiveDatabase', () => {
      expect(ReactiveDatabase).toBeDefined()
    })

    test('re-exports useQuery hook', () => {
      expect(useQuery).toBeDefined()
      expect(typeof useQuery).toBe('function')
    })

    test('re-exports useMutation hook', () => {
      expect(useMutation).toBeDefined()
      expect(typeof useMutation).toBe('function')
    })

    test('re-exports useQueryOne hook', () => {
      expect(useQueryOne).toBeDefined()
      expect(typeof useQueryOne).toBe('function')
    })

    test('re-exports useQueryValue hook', () => {
      expect(useQueryValue).toBeDefined()
      expect(typeof useQueryValue).toBe('function')
    })
  })
})

describe('SmithersDB integration', () => {
  let db: SmithersDB | null = null

  afterEach(() => {
    if (db) {
      db.close()
      db = null
    }
  })

  test('full execution lifecycle: start -> phase -> agent -> complete', async () => {
    db = createSmithersDB()
    
    const execId = db.execution.start('integration-test', 'test.tsx')
    expect(execId).toBeDefined()
    
    const phaseId = db.phases.start('test-phase', 0)
    expect(phaseId).toBeDefined()
    
    const agentId = await db.agents.start('test prompt', 'sonnet')
    expect(agentId).toBeDefined()
    
    db.agents.complete(agentId, 'agent output')
    db.phases.complete(phaseId)
    db.execution.complete(execId)
    
    const exec = db.query<{ status: string }>('SELECT status FROM executions WHERE id = ?', [execId])
    expect(exec[0].status).toBe('completed')
  })

  test('nested context: execution -> phase -> agent', async () => {
    db = createSmithersDB()
    
    const execId = db.execution.start('nested-test', 'test.tsx')
    const phaseId = db.phases.start('phase', 0)
    const agentId = await db.agents.start('prompt', 'sonnet')
    
    const agent = db.query<{ phase_id: string }>('SELECT phase_id FROM agents WHERE id = ?', [agentId])
    expect(agent[0].phase_id).toBe(phaseId)
    
    const phase = db.query<{ execution_id: string }>('SELECT execution_id FROM phases WHERE id = ?', [phaseId])
    expect(phase[0].execution_id).toBe(execId)
  })

  test('render frames capture during execution', () => {
    db = createSmithersDB()
    
    db.execution.start('render-test', 'test.tsx')
    db.renderFrames.store('<smithers>frame1</smithers>', 0)
    db.renderFrames.store('<smithers>frame2</smithers>', 1)
    
    const frames = db.renderFrames.list()
    expect(frames).toHaveLength(2)
    expect(frames[0].ralph_count).toBe(0)
    expect(frames[1].ralph_count).toBe(1)
  })

  test('artifact creation during execution', () => {
    db = createSmithersDB()
    
    db.execution.start('artifact-test', 'test.tsx')
    db.artifacts.add('test.ts', 'code', '/src/test.ts', undefined, { lines: 100 })
    
    const artifacts = db.artifacts.list(db.query<{ id: string }>('SELECT id FROM executions')[0].id)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].name).toBe('test.ts')
    expect(artifacts[0].metadata).toEqual({ lines: 100 })
  })

  test('report creation during execution', async () => {
    db = createSmithersDB()
    
    db.execution.start('report-test', 'test.tsx')
    await db.vcs.addReport({
      type: 'progress',
      title: 'Test Report',
      content: 'Report content'
    })
    
    const reports = db.query<{ title: string }>('SELECT title FROM reports')
    expect(reports).toHaveLength(1)
    expect(reports[0].title).toBe('Test Report')
  })
})
