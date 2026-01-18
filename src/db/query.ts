// Raw query access module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite'

export type QueryFunction = <T>(sql: string, params?: any[]) => T[]

export interface QueryModuleContext {
  rdb: ReactiveDatabase
}

export function createQueryModule(ctx: QueryModuleContext): QueryFunction {
  const { rdb } = ctx

  return <T>(sql: string, params?: any[]): T[] => {
    return rdb.query<T>(sql, params ?? [])
  }
}
