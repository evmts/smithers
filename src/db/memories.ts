// Memory CRUD operations module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Memory, MemoryInput, SqlParam } from './types.js'
import { uuid, now } from './utils.js'

export interface MemoriesModule {
  add: (memory: MemoryInput) => string
  get: (category: string, key: string, scope?: string) => Memory | null
  list: (category?: string, scope?: string, limit?: number) => Memory[]
  search: (query: string, category?: string, limit?: number) => Memory[]
  update: (id: string, updates: Partial<Pick<Memory, 'content' | 'confidence' | 'expires_at'>>) => void
  delete: (id: string) => void
  addFact: (key: string, content: string, source?: string) => string
  addLearning: (key: string, content: string, source?: string) => string
  addPreference: (key: string, content: string, scope?: 'global' | 'project' | 'session') => string
  stats: () => { total: number; byCategory: Record<string, number>; byScope: Record<string, number> }
}

export interface MemoriesModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createMemoriesModule(ctx: MemoriesModuleContext): MemoriesModule {
  const { rdb, getCurrentExecutionId } = ctx

  const memories: MemoriesModule = {
    add: (memory: MemoryInput): string => {
      if (rdb.isClosed) return uuid()
      const id = uuid()
      rdb.run(
        `INSERT INTO memories (id, category, scope, key, content, confidence, source, source_execution_id, created_at, updated_at, accessed_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, memory.category, memory.scope ?? 'global', memory.key, memory.content,
         memory.confidence ?? 1.0, memory.source ?? null, getCurrentExecutionId(),
         now(), now(), now(), memory.expires_at?.toISOString() ?? null]
      )
      return id
    },

    get: (category: string, key: string, scope?: string): Memory | null => {
      if (rdb.isClosed) return null
      const row = rdb.queryOne<Memory>(
        `SELECT * FROM memories WHERE category = ? AND key = ? AND (scope = ? OR ? IS NULL)`,
        [category, key, scope ?? null, scope ?? null]
      )
      if (row) {
        rdb.run('UPDATE memories SET accessed_at = ? WHERE id = ?', [now(), row.id])
      }
      return row
    },

    list: (category?: string, scope?: string, limit: number = 100): Memory[] => {
      if (rdb.isClosed) return []
      let sql = 'SELECT * FROM memories WHERE 1=1'
      const params: SqlParam[] = []
      if (category) { sql += ' AND category = ?'; params.push(category) }
      if (scope) { sql += ' AND scope = ?'; params.push(scope) }
      sql += ' ORDER BY created_at DESC LIMIT ?'
      params.push(limit)
      return rdb.query<Memory>(sql, params)
    },

    search: (query: string, category?: string, limit: number = 20): Memory[] => {
      let sql = 'SELECT * FROM memories WHERE content LIKE ?'
      const params: SqlParam[] = [`%${query}%`]
      if (category) { sql += ' AND category = ?'; params.push(category) }
      sql += ' ORDER BY created_at DESC LIMIT ?'
      params.push(limit)
      return rdb.query<Memory>(sql, params)
    },

    update: (id: string, updates: Partial<Pick<Memory, 'content' | 'confidence' | 'expires_at'>>) => {
      const sets: string[] = ['updated_at = ?']
      const params: SqlParam[] = [now()]
      if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
      if (updates.confidence !== undefined) { sets.push('confidence = ?'); params.push(updates.confidence) }
      if (updates.expires_at !== undefined) { sets.push('expires_at = ?'); params.push(updates.expires_at?.toISOString() ?? null) }
      params.push(id)
      rdb.run(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`, params)
    },

    delete: (id: string) => {
      rdb.run('DELETE FROM memories WHERE id = ?', [id])
    },

    addFact: (key: string, content: string, source?: string): string => {
      return memories.add({ category: 'fact', key, content, ...(source ? { source } : {}) })
    },

    addLearning: (key: string, content: string, source?: string): string => {
      return memories.add({ category: 'learning', key, content, ...(source ? { source } : {}) })
    },

    addPreference: (key: string, content: string, scope?: 'global' | 'project' | 'session'): string => {
      return memories.add({ category: 'preference', key, content, ...(scope ? { scope } : {}) })
    },

    stats: () => {
      const total = rdb.queryValue<number>('SELECT COUNT(*) FROM memories') ?? 0
      const byCategory: Record<string, number> = {}
      const byCategoryRows = rdb.query<{ category: string; count: number }>(
        'SELECT category, COUNT(*) as count FROM memories GROUP BY category'
      )
      for (const row of byCategoryRows) byCategory[row.category] = row.count

      const byScope: Record<string, number> = {}
      const byScopeRows = rdb.query<{ scope: string; count: number }>(
        'SELECT scope, COUNT(*) as count FROM memories GROUP BY scope'
      )
      for (const row of byScopeRows) byScope[row.scope] = row.count

      return { total, byCategory, byScope }
    },
  }

  return memories
}
