/**
 * Tests for steps module - step tracking with VCS metadata
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createStepsModule } from './steps.js'

describe('StepsModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null
  let currentPhaseId: string | null = null
  let currentStepId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS phases (
        id TEXT PRIMARY KEY,
        execution_id TEXT
      );

      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        phase_id TEXT,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        duration_ms INTEGER,
        snapshot_before TEXT,
        snapshot_after TEXT,
        commit_created TEXT
      );
    `)
  }

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    setupSchema()
    currentExecutionId = null
    currentPhaseId = null
    currentStepId = null
  })

  afterEach(() => {
    db.close()
  })

  const createSteps = () => {
    return createStepsModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId,
      getCurrentPhaseId: () => currentPhaseId,
      getCurrentStepId: () => currentStepId,
      setCurrentStepId: (id) => { currentStepId = id }
    })
  }

  describe('start', () => {
    test('creates step with running status', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('analyze')

      const step = db.queryOne<any>('SELECT * FROM steps WHERE id = ?', [id])

      expect(step).not.toBeNull()
      expect(step.name).toBe('analyze')
      expect(step.status).toBe('running')
      expect(step.execution_id).toBe(currentExecutionId)
    })

    test('associates with current phase', () => {
      currentExecutionId = 'exec-1'
      currentPhaseId = 'phase-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO phases (id, execution_id) VALUES (?, ?)', [currentPhaseId, currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      const step = db.queryOne<any>('SELECT phase_id FROM steps WHERE id = ?', [id])
      expect(step.phase_id).toBe(currentPhaseId)
    })

    test('handles null phase_id', () => {
      currentExecutionId = 'exec-1'
      currentPhaseId = null
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('init')

      const step = db.queryOne<any>('SELECT phase_id FROM steps WHERE id = ?', [id])
      expect(step.phase_id).toBeNull()
    })

    test('handles null name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start()

      const step = db.queryOne<any>('SELECT name FROM steps WHERE id = ?', [id])
      expect(step.name).toBeNull()
    })

    test('sets current step id', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('test')

      expect(currentStepId).toBe(id)
    })

    test('records started_at timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('deploy')

      const step = db.queryOne<any>('SELECT started_at FROM steps WHERE id = ?', [id])
      expect(step.started_at).not.toBeNull()
    })

    test('throws without active execution', () => {
      currentExecutionId = null
      const steps = createSteps()

      expect(() => steps.start('test')).toThrow('No active execution')
    })
  })

  describe('complete', () => {
    test('sets status to completed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      steps.complete(id)

      const step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('completed')
    })

    test('records completed_at timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      steps.complete(id)

      const step = db.queryOne<any>('SELECT completed_at FROM steps WHERE id = ?', [id])
      expect(step.completed_at).not.toBeNull()
    })

    test('calculates duration_ms', async () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      await new Promise(resolve => setTimeout(resolve, 10))

      steps.complete(id)

      const step = db.queryOne<any>('SELECT duration_ms FROM steps WHERE id = ?', [id])
      expect(step.duration_ms).toBeGreaterThanOrEqual(0)
    })

    test('stores VCS snapshot_before', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('edit')

      steps.complete(id, { snapshot_before: 'abc123' })

      const step = db.queryOne<any>('SELECT snapshot_before FROM steps WHERE id = ?', [id])
      expect(step.snapshot_before).toBe('abc123')
    })

    test('stores VCS snapshot_after', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('edit')

      steps.complete(id, { snapshot_after: 'def456' })

      const step = db.queryOne<any>('SELECT snapshot_after FROM steps WHERE id = ?', [id])
      expect(step.snapshot_after).toBe('def456')
    })

    test('stores VCS commit_created', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('commit')

      steps.complete(id, { commit_created: 'xyz789' })

      const step = db.queryOne<any>('SELECT commit_created FROM steps WHERE id = ?', [id])
      expect(step.commit_created).toBe('xyz789')
    })

    test('stores all VCS info together', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('full-cycle')

      steps.complete(id, {
        snapshot_before: 'before',
        snapshot_after: 'after',
        commit_created: 'commit'
      })

      const step = db.queryOne<any>('SELECT snapshot_before, snapshot_after, commit_created FROM steps WHERE id = ?', [id])
      expect(step.snapshot_before).toBe('before')
      expect(step.snapshot_after).toBe('after')
      expect(step.commit_created).toBe('commit')
    })

    test('clears current step id if matching', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      expect(currentStepId).toBe(id)

      steps.complete(id)

      expect(currentStepId).toBeNull()
    })

    test('does not clear current step id if different', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id1 = steps.start('step1')
      const id2 = steps.start('step2')

      expect(currentStepId).toBe(id2)

      steps.complete(id1)

      expect(currentStepId).toBe(id2)
    })
  })

  describe('fail', () => {
    test('sets status to failed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      steps.fail(id)

      const step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('failed')
    })

    test('records completed_at timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      steps.fail(id)

      const step = db.queryOne<any>('SELECT completed_at FROM steps WHERE id = ?', [id])
      expect(step.completed_at).not.toBeNull()
    })

    test('clears current step id if matching', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      steps.fail(id)

      expect(currentStepId).toBeNull()
    })
  })

  describe('current', () => {
    test('returns current step', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('build')

      const current = steps.current()

      expect(current).not.toBeNull()
      expect(current!.id).toBe(id)
      expect(current!.name).toBe('build')
    })

    test('returns null when no current step', () => {
      const steps = createSteps()

      expect(steps.current()).toBeNull()
    })
  })

  describe('list', () => {
    test('returns steps for phase ordered by created_at', () => {
      currentExecutionId = 'exec-1'
      currentPhaseId = 'phase-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO phases (id, execution_id) VALUES (?, ?)', [currentPhaseId, currentExecutionId])

      const steps = createSteps()
      const id1 = steps.start('step1')
      const id2 = steps.start('step2')
      const id3 = steps.start('step3')

      const list = steps.list(currentPhaseId)

      expect(list).toHaveLength(3)
      const ids = list.map(s => s.id)
      expect(ids).toContain(id1)
      expect(ids).toContain(id2)
      expect(ids).toContain(id3)
    })

    test('returns empty array for non-existent phase', () => {
      const steps = createSteps()

      const list = steps.list('nonexistent')

      expect(list).toEqual([])
    })
  })

  describe('getByExecution', () => {
    test('returns all steps for execution', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO phases (id, execution_id) VALUES (?, ?)', ['phase-1', currentExecutionId])
      db.run('INSERT INTO phases (id, execution_id) VALUES (?, ?)', ['phase-2', currentExecutionId])

      const steps = createSteps()

      currentPhaseId = 'phase-1'
      steps.start('step1')
      steps.start('step2')

      currentPhaseId = 'phase-2'
      steps.start('step3')

      currentPhaseId = null
      steps.start('step4')

      const list = steps.getByExecution(currentExecutionId)

      expect(list).toHaveLength(4)
    })

    test('returns empty array for non-existent execution', () => {
      const steps = createSteps()

      const list = steps.getByExecution('nonexistent')

      expect(list).toEqual([])
    })
  })
})
