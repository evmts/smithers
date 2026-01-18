// Live query helpers for React reactivity
// These create reactive state that updates when PGlite data changes

import type { PGlite } from '@electric-sql/pglite'

// Note: In a real React context, these would use useState/useEffect
// For now, we provide the interface that would be used

export interface LiveQueryHelpers {
  /**
   * Create a live query that returns an array of rows
   * Updates automatically when the underlying data changes
   */
  createLiveQuery<T>(
    pg: PGlite,
    sql: string,
    params?: any[]
  ): () => T[]

  /**
   * Create a live query that returns a single value
   * Returns null if no rows match
   */
  createLiveValue<T>(
    pg: PGlite,
    sql: string,
    params?: any[]
  ): () => T | null

  /**
   * Create a live query for a single row
   * Returns null if no rows match
   */
  createLiveRow<T>(
    pg: PGlite,
    sql: string,
    params?: any[]
  ): () => T | null
}

/**
 * Implementation for React environment
 * This would be used inside React components with hooks
 */
export function createLiveQueryHelpers(): LiveQueryHelpers {
  // These functions would use React hooks (useState, useEffect)
  // For now, we provide a stub that can be implemented in React context

  return {
    createLiveQuery<T>(_pg: PGlite, _sql: string, _params: any[] = []): () => T[] {
      // In React:
      // const [data, setData] = useState<T[]>([])
      // useEffect(() => {
      //   const { unsubscribe } = pg.live.query(sql, params, (res) => {
      //     setData(res.rows as T[])
      //   })
      //   return () => unsubscribe()
      // }, [sql, params])
      // return () => data

      // Stub for non-React environment
      throw new Error('createLiveQuery requires React context')
    },

    createLiveValue<T>(_pg: PGlite, _sql: string, _params: any[] = []): () => T | null {
      // In React:
      // const rows = createLiveQuery<{ value: T }>(pg, sql, params)
      // return () => rows()[0]?.value ?? null

      throw new Error('createLiveValue requires React context')
    },

    createLiveRow<T>(_pg: PGlite, _sql: string, _params: any[] = []): () => T | null {
      // In React:
      // const rows = createLiveQuery<T>(pg, sql, params)
      // return () => rows()[0] ?? null

      throw new Error('createLiveRow requires React context')
    },
  }
}

/**
 * Simpler non-reactive query helpers for CLI/monitoring contexts
 * These don't use React, just return promises
 */
export class QueryHelpers {
  constructor(private pg: PGlite) {}

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.pg.query(sql, params)
    return result.rows as T[]
  }

  async queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params)
    return rows[0] ?? null
  }

  async queryValue<T>(sql: string, params?: any[]): Promise<T | null> {
    const row = await this.queryOne<{ value: T }>(sql, params)
    return row?.value ?? null
  }

  /**
   * Execute a query and return the number of affected rows
   */
  async execute(sql: string, params?: any[]): Promise<number> {
    const result = await this.pg.query(sql, params)
    return result.affectedRows ?? 0
  }
}
