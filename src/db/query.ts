import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { SqlParam } from './types.js'

export type QueryFunction = <T>(sql: string, params?: SqlParam[]) => T[]

export interface QueryModuleContext {
  rdb: ReactiveDatabase
}

export function createQueryModule(ctx: QueryModuleContext): QueryFunction {
  const { rdb } = ctx

  return <T>(sql: string, params?: SqlParam[]): T[] => {
    return rdb.query<T>(sql, params ?? [])
  }
}
