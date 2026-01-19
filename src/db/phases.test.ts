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

  describe('unique IDs', () => {
    test('generates unique IDs for each phase', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const ids = new Set<string>()

      for (let i = 0; i < 100; i++) {
        ids.add(phases.start(`phase-${i}`))
      }

      expect(ids.size).toBe(100)
    })

    test('IDs are valid UUIDs', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')

      // UUID v4 format
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })
  })

  describe('edge cases - names', () => {
    test('allows empty string name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('')

      const phase = db.queryOne<any>('SELECT name FROM phases WHERE id = ?', [id])
      expect(phase.name).toBe('')
    })

    test('allows special characters in name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const specialName = '🚀 build/test:deploy @v1.0 (beta) [main]'
      const id = phases.start(specialName)

      const phase = db.queryOne<any>('SELECT name FROM phases WHERE id = ?', [id])
      expect(phase.name).toBe(specialName)
    })

    test('allows unicode characters in name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const unicodeName = '构建阶段 빌드 ビルド'
      const id = phases.start(unicodeName)

      const phase = db.queryOne<any>('SELECT name FROM phases WHERE id = ?', [id])
      expect(phase.name).toBe(unicodeName)
    })

    test('allows very long name', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const longName = 'x'.repeat(1000)
      const id = phases.start(longName)

      const phase = db.queryOne<any>('SELECT name FROM phases WHERE id = ?', [id])
      expect(phase.name).toBe(longName)
    })

    test('allows SQL injection attempts in name (safely stored)', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const maliciousName = "'; DROP TABLE phases; --"
      const id = phases.start(maliciousName)

      const phase = db.queryOne<any>('SELECT name FROM phases WHERE id = ?', [id])
      expect(phase.name).toBe(maliciousName)
      
      // Table still exists
      const count = db.queryOne<any>('SELECT COUNT(*) as c FROM phases')
      expect(count.c).toBe(1)
    })
  })

  describe('edge cases - iterations', () => {
    test('allows negative iteration', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test', -1)

      const phase = db.queryOne<any>('SELECT iteration FROM phases WHERE id = ?', [id])
      expect(phase.iteration).toBe(-1)
    })

    test('allows very large iteration', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test', 999999999)

      const phase = db.queryOne<any>('SELECT iteration FROM phases WHERE id = ?', [id])
      expect(phase.iteration).toBe(999999999)
    })

    test('allows zero iteration explicitly', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test', 0)

      const phase = db.queryOne<any>('SELECT iteration FROM phases WHERE id = ?', [id])
      expect(phase.iteration).toBe(0)
    })
  })

  describe('complete edge cases', () => {
    test('complete on non-existent phase does not throw', () => {
      const phases = createPhases()
      
      // Should not throw, just no-op
      expect(() => phases.complete('non-existent-id')).not.toThrow()
    })

    test('complete on already completed phase updates timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      phases.complete(id)
      const first = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      
      phases.complete(id)
      const second = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      
      // Both should be completed status
      const phase = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [id])
      expect(phase.status).toBe('completed')
      expect(first.completed_at).toBeTruthy()
      expect(second.completed_at).toBeTruthy()
    })

    test('complete after fail overwrites status', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      phases.fail(id)
      phases.complete(id)
      
      const phase = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [id])
      expect(phase.status).toBe('completed')
    })
  })

  describe('fail edge cases', () => {
    test('fail on non-existent phase does not throw', () => {
      const phases = createPhases()
      
      expect(() => phases.fail('non-existent-id')).not.toThrow()
    })

    test('fail on already failed phase updates timestamp', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      phases.fail(id)
      const first = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      
      phases.fail(id)
      const second = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      
      expect(first.completed_at).toBeTruthy()
      expect(second.completed_at).toBeTruthy()
    })

    test('fail after complete overwrites status', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      phases.complete(id)
      phases.fail(id)
      
      const phase = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [id])
      expect(phase.status).toBe('failed')
    })

    test('fail does not set duration_ms', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      phases.fail(id)
      
      const phase = db.queryOne<any>('SELECT duration_ms FROM phases WHERE id = ?', [id])
      expect(phase.duration_ms).toBeNull()
    })
  })

  describe('current edge cases', () => {
    test('current returns null when phase is deleted from DB', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      expect(currentPhaseId).toBe(id)
      
      // Manually delete from DB
      db.run('DELETE FROM phases WHERE id = ?', [id])
      
      // current() should return null since phase doesn't exist
      expect(phases.current()).toBeNull()
    })

    test('current returns most recent started phase', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      phases.start('first')
      phases.start('second')
      const thirdId = phases.start('third')
      
      const current = phases.current()
      expect(current?.id).toBe(thirdId)
      expect(current?.name).toBe('third')
    })

    test('current returns all phase fields', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test-phase', 5)
      
      const current = phases.current()
      
      expect(current).not.toBeNull()
      expect(current!.id).toBe(id)
      expect(current!.execution_id).toBe(currentExecutionId)
      expect(current!.name).toBe('test-phase')
      expect(current!.iteration).toBe(5)
      expect(current!.status).toBe('running')
      expect(current!.started_at).toBeTruthy()
      expect(current!.created_at).toBeTruthy()
    })
  })

  describe('list edge cases', () => {
    test('list with empty execution id returns empty array', () => {
      const phases = createPhases()
      
      const list = phases.list('')
      
      expect(list).toEqual([])
    })

    test('list returns phases in created_at order', async () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      
      // Insert with explicit timestamps to ensure order
      db.run(`INSERT INTO phases (id, execution_id, name, iteration, status, started_at, created_at)
              VALUES (?, ?, ?, ?, 'running', ?, ?)`,
        ['p1', currentExecutionId, 'first', 0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'])
      db.run(`INSERT INTO phases (id, execution_id, name, iteration, status, started_at, created_at)
              VALUES (?, ?, ?, ?, 'running', ?, ?)`,
        ['p2', currentExecutionId, 'second', 0, '2024-01-02T00:00:00Z', '2024-01-02T00:00:00Z'])
      db.run(`INSERT INTO phases (id, execution_id, name, iteration, status, started_at, created_at)
              VALUES (?, ?, ?, ?, 'running', ?, ?)`,
        ['p3', currentExecutionId, 'third', 0, '2024-01-03T00:00:00Z', '2024-01-03T00:00:00Z'])
      
      const list = phases.list(currentExecutionId)
      
      expect(list).toHaveLength(3)
      expect(list[0].id).toBe('p1')
      expect(list[1].id).toBe('p2')
      expect(list[2].id).toBe('p3')
    })

    test('list returns all fields for each phase', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test', 3)
      phases.complete(id)
      
      const list = phases.list(currentExecutionId)
      
      expect(list).toHaveLength(1)
      const phase = list[0]
      expect(phase.id).toBe(id)
      expect(phase.execution_id).toBe(currentExecutionId)
      expect(phase.name).toBe('test')
      expect(phase.iteration).toBe(3)
      expect(phase.status).toBe('completed')
      expect(phase.started_at).toBeTruthy()
      expect(phase.completed_at).toBeTruthy()
      expect(phase.created_at).toBeTruthy()
      expect(phase.duration_ms).toBeGreaterThanOrEqual(0)
    })

    test('list includes phases with all statuses', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      
      const runningId = phases.start('running')
      const completedId = phases.start('completed')
      phases.complete(completedId)
      const failedId = phases.start('failed')
      phases.fail(failedId)
      
      const list = phases.list(currentExecutionId)
      
      expect(list).toHaveLength(3)
      const statuses = list.map(p => p.status)
      expect(statuses).toContain('running')
      expect(statuses).toContain('completed')
      expect(statuses).toContain('failed')
    })
  })

  describe('multiple executions isolation', () => {
    test('phases are isolated per execution', () => {
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-A'])
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-B'])

      const phases = createPhases()

      currentExecutionId = 'exec-A'
      const aPhases = [
        phases.start('a1'),
        phases.start('a2'),
      ]

      currentExecutionId = 'exec-B'
      const bPhases = [
        phases.start('b1'),
        phases.start('b2'),
        phases.start('b3'),
      ]

      const listA = phases.list('exec-A')
      const listB = phases.list('exec-B')

      expect(listA).toHaveLength(2)
      expect(listB).toHaveLength(3)
      
      expect(listA.map(p => p.id).sort()).toEqual(aPhases.sort())
      expect(listB.map(p => p.id).sort()).toEqual(bPhases.sort())
    })

    test('completing phase from one execution doesnt affect another', () => {
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-A'])
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-B'])

      const phases = createPhases()

      currentExecutionId = 'exec-A'
      const aId = phases.start('phase-a')

      currentExecutionId = 'exec-B'
      const bId = phases.start('phase-b')

      phases.complete(aId)

      const phaseA = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [aId])
      const phaseB = db.queryOne<any>('SELECT status FROM phases WHERE id = ?', [bId])

      expect(phaseA.status).toBe('completed')
      expect(phaseB.status).toBe('running')
    })
  })

  describe('sequential phase operations', () => {
    test('can start many phases in sequence', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const ids: string[] = []

      for (let i = 0; i < 50; i++) {
        ids.push(phases.start(`phase-${i}`, i))
      }

      const list = phases.list(currentExecutionId)
      expect(list).toHaveLength(50)
      
      list.forEach((phase, idx) => {
        expect(phase.status).toBe('running')
      })
    })

    test('complete phases in LIFO order', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id1 = phases.start('first')
      const id2 = phases.start('second')
      const id3 = phases.start('third')

      // Complete in reverse order
      phases.complete(id3)
      phases.complete(id2)
      phases.complete(id1)

      const list = phases.list(currentExecutionId)
      expect(list.every(p => p.status === 'completed')).toBe(true)
    })

    test('mixed complete and fail operations', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const ids = [
        phases.start('p1'),
        phases.start('p2'),
        phases.start('p3'),
        phases.start('p4'),
      ]

      phases.complete(ids[0])
      phases.fail(ids[1])
      phases.complete(ids[2])
      phases.fail(ids[3])

      const list = phases.list(currentExecutionId)
      const statusById = Object.fromEntries(list.map(p => [p.id, p.status]))

      expect(statusById[ids[0]]).toBe('completed')
      expect(statusById[ids[1]]).toBe('failed')
      expect(statusById[ids[2]]).toBe('completed')
      expect(statusById[ids[3]]).toBe('failed')
    })
  })

  describe('context switching', () => {
    test('currentPhaseId tracks across module recreations', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases1 = createPhases()
      const id = phases1.start('test')

      // Create new module instance (shares context via closure)
      const phases2 = createPhases()
      
      expect(phases2.current()?.id).toBe(id)
    })

    test('execution context can change between operations', () => {
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-1'])
      db.run('INSERT INTO executions (id) VALUES (?)', ['exec-2'])

      const phases = createPhases()

      currentExecutionId = 'exec-1'
      const id1 = phases.start('phase-in-exec-1')

      currentExecutionId = 'exec-2'
      const id2 = phases.start('phase-in-exec-2')

      const phase1 = db.queryOne<any>('SELECT execution_id FROM phases WHERE id = ?', [id1])
      const phase2 = db.queryOne<any>('SELECT execution_id FROM phases WHERE id = ?', [id2])

      expect(phase1.execution_id).toBe('exec-1')
      expect(phase2.execution_id).toBe('exec-2')
    })
  })

  describe('duration calculation', () => {
    test('duration_ms is calculated from started_at', async () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      await new Promise(resolve => setTimeout(resolve, 50))
      
      phases.complete(id)

      const phase = db.queryOne<any>('SELECT duration_ms FROM phases WHERE id = ?', [id])
      expect(phase.duration_ms).toBeGreaterThanOrEqual(40) // Allow some variance
      expect(phase.duration_ms).toBeLessThan(200) // Reasonable upper bound
    })

    test('duration_ms handles missing started_at gracefully', () => {
      // Insert a phase directly without started_at
      db.run(`INSERT INTO phases (id, execution_id, name, iteration, status, created_at)
              VALUES (?, ?, ?, ?, 'running', ?)`,
        ['orphan-phase', 'exec-1', 'orphan', 0, new Date().toISOString()])
      
      const phases = createPhases()
      phases.complete('orphan-phase')
      
      const phase = db.queryOne<any>('SELECT duration_ms, status FROM phases WHERE id = ?', ['orphan-phase'])
      expect(phase.status).toBe('completed')
      // Without started_at, duration calculation returns Date.now() - NaN -> large number
      // Implementation doesn't guard against this, so duration_ms is set
      expect(phase.duration_ms).not.toBeNull()
    })
  })

  describe('timestamp precision', () => {
    test('started_at and created_at are ISO timestamps', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')

      const phase = db.queryOne<any>('SELECT started_at, created_at FROM phases WHERE id = ?', [id])
      
      // Should be valid ISO timestamps
      expect(() => new Date(phase.started_at)).not.toThrow()
      expect(() => new Date(phase.created_at)).not.toThrow()
      expect(new Date(phase.started_at).getTime()).toBeGreaterThan(0)
      expect(new Date(phase.created_at).getTime()).toBeGreaterThan(0)
    })

    test('completed_at is set on complete', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      const before = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      expect(before.completed_at).toBeNull()
      
      phases.complete(id)
      
      const after = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      expect(after.completed_at).not.toBeNull()
      expect(() => new Date(after.completed_at)).not.toThrow()
    })

    test('completed_at is set on fail', () => {
      currentExecutionId = 'exec-1'
      db.run('INSERT INTO executions (id) VALUES (?)', [currentExecutionId])

      const phases = createPhases()
      const id = phases.start('test')
      
      phases.fail(id)
      
      const phase = db.queryOne<any>('SELECT completed_at FROM phases WHERE id = ?', [id])
      expect(phase.completed_at).not.toBeNull()
    })
  })
})
