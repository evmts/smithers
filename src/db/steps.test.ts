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

  describe('edge cases', () => {
    test('step with empty string name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('')

      const step = db.queryOne<any>('SELECT name FROM steps WHERE id = ?', [id])
      expect(step.name).toBe('')
    })

    test('step with whitespace name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('   ')

      const step = db.queryOne<any>('SELECT name FROM steps WHERE id = ?', [id])
      expect(step.name).toBe('   ')
    })

    test('step with unicode name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('テスト 🚀 émoji')

      const step = db.queryOne<any>('SELECT name FROM steps WHERE id = ?', [id])
      expect(step.name).toBe('テスト 🚀 émoji')
    })

    test('step with very long name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const longName = 'a'.repeat(10000)
      const id = steps.start(longName)

      const step = db.queryOne<any>('SELECT name FROM steps WHERE id = ?', [id])
      expect(step.name).toBe(longName)
    })
  })

  describe('status transitions', () => {
    test('running -> completed transition', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('test')

      let step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('running')

      steps.complete(id)

      step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('completed')
    })

    test('running -> failed transition', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('test')

      let step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('running')

      steps.fail(id)

      step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('failed')
    })

    test('complete non-existent step does not throw', () => {
      const steps = createSteps()
      expect(() => steps.complete('nonexistent')).not.toThrow()
    })

    test('fail non-existent step does not throw', () => {
      const steps = createSteps()
      expect(() => steps.fail('nonexistent')).not.toThrow()
    })

    test('completing already completed step', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('test')
      steps.complete(id)
      steps.complete(id)

      const step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('completed')
    })

    test('failing already failed step', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('test')
      steps.fail(id)
      steps.fail(id)

      const step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('failed')
    })

    test('completing after failing overwrites status', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('test')
      steps.fail(id)
      steps.complete(id)

      const step = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id])
      expect(step.status).toBe('completed')
    })
  })

  describe('concurrent step operations', () => {
    test('multiple steps can be running simultaneously', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      steps.start('step1')
      steps.start('step2')
      steps.start('step3')

      const runningSteps = db.query<any>('SELECT * FROM steps WHERE status = ?', ['running'])
      expect(runningSteps).toHaveLength(3)
    })

    test('completing one step does not affect others', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id1 = steps.start('step1')
      const id2 = steps.start('step2')
      const id3 = steps.start('step3')

      steps.complete(id2)

      const step1 = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id1])
      const step2 = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id2])
      const step3 = db.queryOne<any>('SELECT status FROM steps WHERE id = ?', [id3])

      expect(step1.status).toBe('running')
      expect(step2.status).toBe('completed')
      expect(step3.status).toBe('running')
    })

    test('steps across different phases', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO phases (id, execution_id) VALUES (?, ?)', ['phase-1', currentExecutionId])
      db.run('INSERT INTO phases (id, execution_id) VALUES (?, ?)', ['phase-2', currentExecutionId])

      const steps = createSteps()

      currentPhaseId = 'phase-1'
      const id1 = steps.start('step-in-phase1')

      currentPhaseId = 'phase-2'
      const id2 = steps.start('step-in-phase2')

      const phase1Steps = steps.list('phase-1')
      const phase2Steps = steps.list('phase-2')

      expect(phase1Steps).toHaveLength(1)
      expect(phase1Steps[0].id).toBe(id1)
      expect(phase2Steps).toHaveLength(1)
      expect(phase2Steps[0].id).toBe(id2)
    })

    test('steps across different executions', () => {
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-1'])
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-2'])

      const steps = createSteps()

      currentExecutionId = 'exec-1'
      steps.start('step-exec1-a')
      steps.start('step-exec1-b')

      currentExecutionId = 'exec-2'
      steps.start('step-exec2')

      const exec1Steps = steps.getByExecution('exec-1')
      const exec2Steps = steps.getByExecution('exec-2')

      expect(exec1Steps).toHaveLength(2)
      expect(exec2Steps).toHaveLength(1)
    })
  })

  describe('closed database handling', () => {
    test('start returns uuid when db is closed', () => {
      currentExecutionId = 'exec-1'
      const steps = createSteps()
      db.close()

      const id = steps.start('test')
      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
    })

    test('complete is no-op when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const steps = createSteps()
      const id = steps.start('test')
      db.close()

      expect(() => steps.complete(id)).not.toThrow()
    })

    test('fail is no-op when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const steps = createSteps()
      const id = steps.start('test')
      db.close()

      expect(() => steps.fail(id)).not.toThrow()
    })

    test('current returns null when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const steps = createSteps()
      steps.start('test')
      db.close()

      expect(steps.current()).toBeNull()
    })

    test('list returns empty array when db is closed', () => {
      currentExecutionId = 'exec-1'
      currentPhaseId = 'phase-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO phases (id, execution_id) VALUES (?, ?)', [currentPhaseId, currentExecutionId])
      const steps = createSteps()
      steps.start('test')
      db.close()

      expect(steps.list(currentPhaseId)).toEqual([])
    })

    test('getByExecution returns empty array when db is closed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      const steps = createSteps()
      steps.start('test')
      db.close()

      expect(steps.getByExecution(currentExecutionId)).toEqual([])
    })
  })

  describe('duration calculation edge cases', () => {
    test('duration is 0 or positive for immediate completion', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('quick')
      steps.complete(id)

      const step = db.queryOne<any>('SELECT duration_ms FROM steps WHERE id = ?', [id])
      expect(step.duration_ms).toBeGreaterThanOrEqual(0)
    })

    test('complete with partial vcs info - only snapshot_before', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('edit')

      steps.complete(id, { snapshot_before: 'snap1' })

      const step = db.queryOne<any>('SELECT snapshot_before, snapshot_after, commit_created FROM steps WHERE id = ?', [id])
      expect(step.snapshot_before).toBe('snap1')
      expect(step.snapshot_after).toBeNull()
      expect(step.commit_created).toBeNull()
    })

    test('complete with empty vcs object', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id = steps.start('edit')

      steps.complete(id, {})

      const step = db.queryOne<any>('SELECT snapshot_before, snapshot_after, commit_created FROM steps WHERE id = ?', [id])
      expect(step.snapshot_before).toBeNull()
      expect(step.snapshot_after).toBeNull()
      expect(step.commit_created).toBeNull()
    })
  })

  describe('list ordering', () => {
    test('steps are ordered by created_at ascending', async () => {
      currentExecutionId = 'exec-1'
      currentPhaseId = 'phase-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])
      db.run('INSERT INTO phases (id, execution_id) VALUES (?, ?)', [currentPhaseId, currentExecutionId])

      const steps = createSteps()
      const id1 = steps.start('first')
      await new Promise(r => setTimeout(r, 5))
      const id2 = steps.start('second')
      await new Promise(r => setTimeout(r, 5))
      const id3 = steps.start('third')

      const list = steps.list(currentPhaseId)

      expect(list[0].id).toBe(id1)
      expect(list[1].id).toBe(id2)
      expect(list[2].id).toBe(id3)
    })

    test('getByExecution orders by created_at ascending', async () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const id1 = steps.start('first')
      await new Promise(r => setTimeout(r, 5))
      const id2 = steps.start('second')
      await new Promise(r => setTimeout(r, 5))
      const id3 = steps.start('third')

      const list = steps.getByExecution(currentExecutionId)

      expect(list[0].id).toBe(id1)
      expect(list[1].id).toBe(id2)
      expect(list[2].id).toBe(id3)
    })
  })

  describe('step ID uniqueness', () => {
    test('each step gets a unique ID', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const steps = createSteps()
      const ids = new Set<string>()

      for (let i = 0; i < 100; i++) {
        ids.add(steps.start(`step-${i}`))
      }

      expect(ids.size).toBe(100)
    })
  })
})
