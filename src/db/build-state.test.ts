import { describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createSmithersDB } from './index.js'

describe('build state module', () => {
  test('claims fixer role on first broken build detection', () => {
    const db = createSmithersDB({ reset: true })

    const first = db.buildState.handleBrokenBuild('agent-a', { waitMs: 1000 })
    expect(first.shouldFix).toBe(true)
    expect(first.state.status).toBe('fixing')
    expect(first.state.fixer_agent_id).toBe('agent-a')

    const second = db.buildState.handleBrokenBuild('agent-b', { waitMs: 1000 })
    expect(second.shouldFix).toBe(false)
    expect(second.state.status).toBe('fixing')
    expect(second.state.fixer_agent_id).toBe('agent-a')

    db.close()
  })

  test('claims fixer when build is broken with no fixer', () => {
    const db = createSmithersDB({ reset: true })
    db.db.run(
      `INSERT INTO build_state (id, status, broken_since, last_check)
       VALUES (1, 'broken', ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = 'broken', broken_since = ?, last_check = ?`,
      [
        new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        new Date().toISOString(),
        new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        new Date().toISOString(),
      ]
    )

    const result = db.buildState.handleBrokenBuild('agent-c', { waitMs: 1000 })
    expect(result.shouldFix).toBe(true)
    expect(result.state.status).toBe('fixing')
    expect(result.state.fixer_agent_id).toBe('agent-c')

    db.close()
  })

  test('cleanup resets stale fixer lock', () => {
    const db = createSmithersDB({ reset: true })
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    db.db.run(
      `INSERT INTO build_state (id, status, fixer_agent_id, broken_since, last_check)
       VALUES (1, 'fixing', 'agent-stale', ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = 'fixing', fixer_agent_id = 'agent-stale', broken_since = ?, last_check = ?`,
      [staleTime, staleTime, staleTime, staleTime]
    )

    const cleaned = db.buildState.cleanup(1)
    expect(cleaned.status).toBe('broken')
    expect(cleaned.fixer_agent_id).toBeNull()

    db.close()
  })

  test('markFixed returns to passing', () => {
    const db = createSmithersDB({ reset: true })
    db.buildState.handleBrokenBuild('agent-d', { waitMs: 1000 })

    const fixed = db.buildState.markFixed()
    expect(fixed.status).toBe('passing')
    expect(fixed.fixer_agent_id).toBeNull()
    expect(fixed.broken_since).toBeNull()

    db.close()
  })

  test('coordinates fixer across multiple db instances', () => {
    const dbPath = path.join(
      os.tmpdir(),
      `smithers-build-state-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    )
    const dbA = createSmithersDB({ path: dbPath, reset: true })
    const dbB = createSmithersDB({ path: dbPath })

    try {
      const first = dbA.buildState.handleBrokenBuild('agent-a', { waitMs: 1000 })
      const second = dbB.buildState.handleBrokenBuild('agent-b', { waitMs: 1000 })

      expect(first.shouldFix).toBe(true)
      expect(first.state.status).toBe('fixing')
      expect(first.state.fixer_agent_id).toBe('agent-a')
      expect(second.shouldFix).toBe(false)
      expect(second.state.status).toBe('fixing')
      expect(second.state.fixer_agent_id).toBe('agent-a')
    } finally {
      dbA.close()
      dbB.close()
      try {
        fs.unlinkSync(dbPath)
      } catch {}
    }
  })
})
