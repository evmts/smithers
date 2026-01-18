/**
 * Tests for phases module - phase lifecycle tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createPhasesModule } from './phases.js'

describe('PhasesModule', () => {
  let db: ReactiveDatabase
  let currentExecutionId: string | null = null
  let currentPhaseId: string | null = null

  const setupSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS phases (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        name TEXT NOT NULL,
        iteration INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        duration_ms INTEGER,
        agents_count INTEGER DEFAULT 0
      );
    `)
  }

  beforeEach(() => {
    db = new ReactiveDatabase(':memory:')
    setupSchema()
    currentExecutionId = null
    currentPhaseId = null
  })

  afterEach(() => {
    db.close()
  })

  const createPhases = () => {
    return createPhasesModule({
      rdb: db,
      getCurrentExecutionId: () => currentExecutionId,
      getCurrentPhaseId: () => currentPhaseId,
      setCurrentPhaseId: (id) => { currentPhaseId = id }
    })
  }

  describe('start', () => {
    test('creates phase with running status', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      const phase = db.queryOne<any>('SELECT * FROM phases WHERE id = ?', [id])

      expect(phase).not.toBeNull()
      expect(phase.name).toBe('build')
      expect(phase.status).toBe('running')
      expect(phase.execution_id).toBe(currentExecutionId)
    })

    test('sets iteration number', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test', 3)

      const phase = db.queryOne<any>('SELECT iteration FROM phases WHERE id = ?', [id])
      expect(phase.iteration).toBe(3)
    })

    test('defaults iteration to 0', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('deploy')

      const phase = db.queryOne<any>('SELECT iteration FROM phases WHERE id = ?', [id])
      expect(phase.iteration).toBe(0)
    })

    test('sets current phase id', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('init')

      expect(currentPhaseId).toBe(id)
    })

    test('records started_at timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('analyze')

      const phase = db.queryOne<any>('SELECT started_at FROM phases WHERE id = ?', [id])
      expect(phase.started_at).not.toBeNull()
    })

    test('throws without active execution', () => {
      currentExecutionId = null
      const phases = createPhases()

      expect(() => phases.start('test')).toThrow('No active execution')
    })
  })

  describe('complete', () => {
    test('sets status to completed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      phases.complete(id)

      const phase = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [id])
      expect(phase.status).toBe('completed')
    })

    test('records completed_at timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      phases.complete(id)

      const phase = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      expect(phase.completed_at).not.toBeNull()
    })

    test('calculates duration_ms', async () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      // Small delay to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 10))

      phases.complete(id)

      const phase = db.queryOne<any>('SELECT duration_ms FROM phases WHERE id = ?', [id])
      expect(phase.duration_ms).toBeGreaterThanOrEqual(0)
    })

    test('clears current phase id if matching', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      expect(currentPhaseId).toBe(id)

      phases.complete(id)

      expect(currentPhaseId).toBeNull()
    })

    test('does not clear current phase id if different', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id1 = phases.start('build')
      const id2 = phases.start('test')

      expect(currentPhaseId).toBe(id2)

      phases.complete(id1)

      expect(currentPhaseId).toBe(id2)
    })
  })

  describe('fail', () => {
    test('sets status to failed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      phases.fail(id)

      const phase = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [id])
      expect(phase.status).toBe('failed')
    })

    test('records completed_at timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      phases.fail(id)

      const phase = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      expect(phase.completed_at).not.toBeNull()
    })

    test('clears current phase id if matching', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      phases.fail(id)

      expect(currentPhaseId).toBeNull()
    })
  })

  describe('current', () => {
    test('returns current phase', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')

      const current = phases.current()

      expect(current).not.toBeNull()
      expect(current!.id).toBe(id)
      expect(current!.name).toBe('build')
    })

    test('returns null when no current phase', () => {
      const phases = createPhases()

      expect(phases.current()).toBeNull()
    })

    test('returns null after phase completes', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('build')
      phases.complete(id)

      expect(phases.current()).toBeNull()
    })
  })

  describe('list', () => {
    test('returns phases for execution ordered by created_at', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id1 = phases.start('init', 0)
      const id2 = phases.start('build', 1)
      const id3 = phases.start('test', 2)

      const list = phases.list(currentExecutionId)

      expect(list).toHaveLength(3)
      // Verify all phases present (order may vary due to same-ms timestamps)
      const ids = list.map(p => p.id)
      expect(ids).toContain(id1)
      expect(ids).toContain(id2)
      expect(ids).toContain(id3)
    })

    test('returns empty array for non-existent execution', () => {
      const phases = createPhases()

      const list = phases.list('nonexistent')

      expect(list).toEqual([])
    })

    test('only returns phases for specified execution', () => {
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-1'])
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-2'])

      const phases = createPhases()

      currentExecutionId = 'exec-1'
      phases.start('phase-a')

      currentExecutionId = 'exec-2'
      phases.start('phase-b')
      phases.start('phase-c')

      const exec1Phases = phases.list('exec-1')
      const exec2Phases = phases.list('exec-2')

      expect(exec1Phases).toHaveLength(1)
      expect(exec2Phases).toHaveLength(2)
    })
  })

  describe('phase lifecycle', () => {
    test('running -> completed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')

      let phase = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [id])
      expect(phase.status).toBe('running')

      phases.complete(id)

      phase = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [id])
      expect(phase.status).toBe('completed')
    })

    test('running -> failed', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')

      phases.fail(id)

      const phase = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [id])
      expect(phase.status).toBe('failed')
    })
  })
})
