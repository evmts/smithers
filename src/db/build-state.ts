import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { now } from './utils.js'
import type { BuildState, BuildStatus } from './types.js'

export type { BuildState, BuildStatus }

export interface BuildStateDecision {
  shouldFix: boolean
  waitMs: number
  state: BuildState
}

export interface BuildStateModule {
  get: () => BuildState
  handleBrokenBuild: (agentId: string, options?: { waitMs?: number; staleMs?: number }) => BuildStateDecision
  markFixed: () => BuildState
  cleanup: (staleMs?: number) => BuildState
}

export interface BuildStateModuleContext {
  rdb: ReactiveDatabase
}

const DEFAULT_STATE: BuildState = {
  id: 1,
  status: 'passing',
  fixer_agent_id: null,
  broken_since: null,
  last_check: null,
}

const DEFAULT_WAIT_MS = 5 * 60 * 1000
const DEFAULT_STALE_MS = 15 * 60 * 1000

export function createBuildStateModule(ctx: BuildStateModuleContext): BuildStateModule {
  const { rdb } = ctx

  const ensureRow = (): void => {
    if (rdb.isClosed) return
    rdb.run(
      `INSERT INTO build_state (id, status, last_check)
       VALUES (1, 'passing', ?)
       ON CONFLICT(id) DO NOTHING`,
      [now()]
    )
  }

  const get = (): BuildState => {
    if (rdb.isClosed) return { ...DEFAULT_STATE }
    ensureRow()
    const row = rdb.queryOne<BuildState>('SELECT * FROM build_state WHERE id = 1')
    return row ?? { ...DEFAULT_STATE }
  }

  const updateState = (next: Partial<BuildState>): BuildState => {
    if (rdb.isClosed) return { ...DEFAULT_STATE, ...next }
    ensureRow()
    const current = get()
    const merged = { ...current, ...next }
    rdb.run(
      `UPDATE build_state
       SET status = ?, fixer_agent_id = ?, broken_since = ?, last_check = ?
       WHERE id = 1`,
      [merged.status, merged.fixer_agent_id, merged.broken_since, merged.last_check]
    )
    return get()
  }

  const cleanup = (staleMs: number = DEFAULT_STALE_MS): BuildState => {
    if (rdb.isClosed) return { ...DEFAULT_STATE }
    ensureRow()
    const current = get()
    if (current.status !== 'fixing' || !current.broken_since) {
      return current
    }
    const brokenSinceMs = Date.parse(current.broken_since)
    if (!Number.isFinite(brokenSinceMs)) {
      return current
    }
    if (Date.now() - brokenSinceMs < staleMs) {
      return current
    }
    return updateState({
      status: 'broken',
      fixer_agent_id: null,
      last_check: now(),
    })
  }

  const handleBrokenBuild = (
    agentId: string,
    options?: { waitMs?: number; staleMs?: number }
  ): BuildStateDecision => {
    if (rdb.isClosed) {
      return { shouldFix: false, waitMs: options?.waitMs ?? DEFAULT_WAIT_MS, state: { ...DEFAULT_STATE } }
    }
    const waitMs = options?.waitMs ?? DEFAULT_WAIT_MS
    const staleMs = options?.staleMs ?? DEFAULT_STALE_MS
    const timestamp = now()

    return rdb.transaction(() => {
      ensureRow()
      const cleaned = cleanup(staleMs)
      const state = cleaned

      if (state.status === 'fixing') {
        const isFixer = state.fixer_agent_id === agentId
        const next = updateState({ last_check: timestamp })
        return { shouldFix: isFixer, waitMs, state: next }
      }

      if (state.status === 'passing') {
        const result = rdb.run(
          `UPDATE build_state
           SET status = 'fixing', fixer_agent_id = ?, broken_since = ?, last_check = ?
           WHERE id = 1 AND status = 'passing'`,
          [agentId, timestamp, timestamp]
        )
        const next = get()
        return { shouldFix: result.changes > 0, waitMs, state: next }
      }

      const brokenSince = state.broken_since ?? timestamp
      const result = rdb.run(
        `UPDATE build_state
         SET status = 'fixing', fixer_agent_id = ?, broken_since = ?, last_check = ?
         WHERE id = 1 AND status = 'broken'`,
        [agentId, brokenSince, timestamp]
      )
      const next = get()
      return { shouldFix: result.changes > 0, waitMs, state: next }
    })
  }

  const markFixed = (): BuildState => {
    if (rdb.isClosed) return { ...DEFAULT_STATE }
    return updateState({
      status: 'passing',
      fixer_agent_id: null,
      broken_since: null,
      last_check: now(),
    })
  }

  return {
    get,
    handleBrokenBuild,
    markFixed,
    cleanup,
  }
}
