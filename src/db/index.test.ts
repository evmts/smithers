/**
 * Tests for index module - SmithersDB factory and integration
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { createSmithersDB, type SmithersDB, ReactiveDatabase } from './index.js'

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
      expect(db.buildState).toBeDefined()
      expect(db.vcsQueue).toBeDefined()
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
      expect(tableNames).toContain('tool_calls')
      expect(tableNames).toContain('transitions')
      expect(tableNames).toContain('commits')
      expect(tableNames).toContain('snapshots')
      expect(tableNames).toContain('reviews')
      expect(tableNames).toContain('reports')
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
      expect(typeof db.memories.get).toBe('function')
    })

    test('execution module is accessible', () => {
      db = createSmithersDB()
      expect(typeof db.execution.start).toBe('function')
      expect(typeof db.execution.complete).toBe('function')
    })
  })
})

describe('SmithersDB Integration', () => {
  let db: SmithersDB | null = null

  afterEach(() => {
    if (db) {
      db.close()
      db = null
    }
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

  test('full execution lifecycle: start -> phase -> agent -> tool -> complete', () => {
    db = createSmithersDB({ reset: true })
    
    const execId = db.execution.start('integration-test', '/path/to/file.tsx')
    expect(db.execution.current()!.status).toBe('running')
    
    const phaseId = db.phases.start('build', 0)
    expect(db.phases.current()!.status).toBe('running')
    
    const agentId = db.agents.start('Build the feature')
    expect(db.agents.current()!.status).toBe('running')
    
    const toolId = db.tools.start(agentId, 'Read', { path: '/src/file.ts' })
    db.tools.complete(toolId, 'file contents')
    
    db.agents.complete(agentId, 'Feature built', undefined, { input: 100, output: 50 })
    expect(db.agents.current()).toBeNull()
    
    db.phases.complete(phaseId)
    expect(db.phases.current()).toBeNull()
    
    db.execution.complete(execId, { success: true })
    expect(db.execution.current()).toBeNull()
    
    const exec = db.execution.get(execId)
    expect(exec!.status).toBe('completed')
    expect(exec!.total_agents).toBe(1)
    expect(exec!.total_tool_calls).toBe(1)
    expect(exec!.total_tokens_used).toBe(150)
  })

  test('state transitions trigger transition logging', () => {
    db = createSmithersDB({ reset: true })
    db.execution.start('state-test', '/path')
    
    db.state.set('status', 'active', 'user_action')
    db.state.set('status', 'paused', 'system')
    db.state.set('status', 'completed', 'agent_finished')
    
    const transitions = db.state.history('status')
    expect(transitions).toHaveLength(3)
    const triggers = transitions.map(t => t.trigger)
    expect(triggers).toContain('user_action')
    expect(triggers).toContain('system')
    expect(triggers).toContain('agent_finished')
  })

  test('nested context: execution -> phase -> step -> agent -> tool', () => {
    db = createSmithersDB({ reset: true })
    
    const execId = db.execution.start('nested-test', '/path')
    const phaseId = db.phases.start('phase1')
    const stepId = db.steps.start('step1')
    const agentId = db.agents.start('agent prompt')
    const toolId = db.tools.start(agentId, 'Bash', { command: 'ls' })
    
    const tool = db.db.queryOne<{ execution_id: string; agent_id: string }>(
      'SELECT execution_id, agent_id FROM tool_calls WHERE id = ?', [toolId]
    )
    expect(tool!.execution_id).toBe(execId)
    expect(tool!.agent_id).toBe(agentId)
    
    const agent = db.db.queryOne<{ phase_id: string }>(
      'SELECT phase_id FROM agents WHERE id = ?', [agentId]
    )
    expect(agent!.phase_id).toBe(phaseId)
    
    const step = db.db.queryOne<{ phase_id: string }>(
      'SELECT phase_id FROM steps WHERE id = ?', [stepId]
    )
    expect(step!.phase_id).toBe(phaseId)
  })

  test('concurrent agents in same phase', () => {
    db = createSmithersDB({ reset: true })
    
    db.execution.start('concurrent-test', '/path')
    db.phases.start('parallel-phase')
    
    const agent1 = db.agents.start('Agent 1 prompt')
    const agent2 = db.agents.start('Agent 2 prompt')
    const agent3 = db.agents.start('Agent 3 prompt')
    
    const agents = db.agents.list(db.execution.current()!.id)
    expect(agents).toHaveLength(3)
    expect(agents.filter(a => a.status === 'running')).toHaveLength(3)
    
    db.agents.complete(agent2, 'Agent 2 done')
    db.agents.fail(agent3, 'Agent 3 failed')
    
    const updatedAgents = db.agents.list(db.execution.current()!.id)
    expect(updatedAgents.find(a => a.id === agent1)!.status).toBe('running')
    expect(updatedAgents.find(a => a.id === agent2)!.status).toBe('completed')
    expect(updatedAgents.find(a => a.id === agent3)!.status).toBe('failed')
  })

  test('multiple iterations with task tracking', () => {
    db = createSmithersDB({ reset: true })
    
    db.execution.start('iteration-test', '/path')
    
    db.state.set('ralphCount', 0)
    const task1 = db.tasks.start('claude', 'task-iter-0')
    db.tasks.complete(task1)
    
    db.state.set('ralphCount', 1)
    const task2 = db.tasks.start('claude', 'task-iter-1')
    const task3 = db.tasks.start('step', 'task-iter-1')
    db.tasks.complete(task2)
    db.tasks.fail(task3)
    
    expect(db.tasks.getTotalCount(0)).toBe(1)
    expect(db.tasks.getTotalCount(1)).toBe(2)
    expect(db.tasks.getRunningCount(0)).toBe(0)
    expect(db.tasks.getRunningCount(1)).toBe(0)
  })

  test('VCS operations during execution', () => {
    db = createSmithersDB({ reset: true })
    db.execution.start('vcs-test', '/path')

    const _commitId = db.vcs.logCommit({
      vcs_type: 'git',
      commit_hash: 'abc123',
      message: 'feat: add feature',
      files_changed: ['src/index.ts'],
      insertions: 10,
      deletions: 2
    })

    const _snapshotId = db.vcs.logSnapshot({
      change_id: 'change-1',
      files_modified: ['src/utils.ts']
    })

    const _reviewId = db.vcs.logReview({
      target_type: 'commit',
      target_ref: 'abc123',
      approved: true,
      summary: 'LGTM',
      issues: []
    })
    
    expect(db.vcs.getCommits()).toHaveLength(1)
    expect(db.vcs.getSnapshots()).toHaveLength(1)
    expect(db.vcs.getReviews()).toHaveLength(1)
  })

  test('human interactions during execution', () => {
    db = createSmithersDB({ reset: true })
    db.execution.start('human-test', '/path')
    
    const requestId = db.human.request('confirmation', 'Deploy to production?', ['yes', 'no'])
    
    expect(db.human.listPending()).toHaveLength(1)
    
    db.human.resolve(requestId, 'approved', { choice: 'yes' })
    
    const interaction = db.human.get(requestId)
    expect(interaction!.status).toBe('approved')
    expect(interaction!.response).toEqual({ choice: 'yes' })
  })

  test('render frames capture during execution', () => {
    db = createSmithersDB({ reset: true })
    db.execution.start('render-test', '/path')
    
    db.renderFrames.store('<root><child1 /></root>', 0)
    db.renderFrames.store('<root><child1 /><child2 /></root>', 1)
    db.renderFrames.store('<root><child1 /><child2 /><child3 /></root>', 2)
    
    expect(db.renderFrames.count()).toBe(3)
    expect(db.renderFrames.latest()!.ralph_count).toBe(2)
    expect(db.renderFrames.getBySequence(1)!.tree_xml).toBe('<root><child1 /><child2 /></root>')
  })

  test('memory operations during execution', () => {
    db = createSmithersDB({ reset: true })
    db.execution.start('memory-test', '/path')
    
    db.memories.addFact('language', 'TypeScript')
    db.memories.addLearning('pattern', 'Use composition over inheritance')
    db.memories.addPreference('style', 'functional', 'project')
    
    expect(db.memories.get('fact', 'language')!.content).toBe('TypeScript')
    expect(db.memories.list('learning')).toHaveLength(1)
    expect(db.memories.stats().total).toBe(3)
  })

  test('artifact creation during execution (extended)', () => {
    db = createSmithersDB({ reset: true })
    const execId = db.execution.start('artifact-test', '/path')
    
    db.artifacts.add('output.json', 'data', '/tmp/output.json', undefined, { size: 1024 })
    db.artifacts.add('report.md', 'document', '/tmp/report.md')
    
    const artifacts = db.artifacts.list(execId)
    expect(artifacts).toHaveLength(2)
    expect(artifacts[0].metadata).toEqual({ size: 1024 })
  })

  test('report creation during execution (extended)', () => {
    db = createSmithersDB({ reset: true })
    db.execution.start('report-test', '/path')
    
    db.vcs.addReport({
      type: 'finding',
      title: 'Security Issue',
      content: 'SQL injection vulnerability found',
      severity: 'critical'
    })
    
    db.vcs.addReport({
      type: 'progress',
      title: 'Step 1 complete',
      content: 'Analysis finished'
    })
    
    expect(db.vcs.getReports()).toHaveLength(2)
    expect(db.vcs.getCriticalReports()).toHaveLength(1)
  })
})
