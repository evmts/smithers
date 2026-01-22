/**
 * Types for the reactive SQLite library
 */

/**
 * Subscription callback type
 */
export type SubscriptionCallback = () => void

/**
 * Row filter for fine-grained invalidation
 */
export interface RowFilter {
  /** Table name */
  table: string
  /** Column used for filtering (e.g., 'id') */
  column: string
  /** Value to match */
  value: string | number
}

/**
 * Query subscription info
 */
export interface QuerySubscription {
  id: string
  tables: Set<string>
  /** Optional row-level filters for fine-grained invalidation */
  rowFilters?: RowFilter[]
  callback: SubscriptionCallback
}

export interface QueryState<T> {
  data: T[]
  isLoading: boolean
  error: Error | null
}

export interface MutationState {
  isLoading: boolean
  error: Error | null
}

export interface UseQueryResult<T> extends QueryState<T> {
  refetch: () => void
}

export interface UseMutationResult<TParams extends any[] = any[]> extends MutationState {
  mutate: (...params: TParams) => void
  mutateAsync: (...params: TParams) => Promise<void>
}

export interface UseQueryOptions {
  skip?: boolean
  deps?: any[]
}

export interface UseMutationOptions {
  invalidateTables?: string[]
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export interface ReactiveDatabaseConfig {
  path: string
  create?: boolean
  readonly?: boolean
}

export type DatabaseEventType = 'insert' | 'update' | 'delete' | 'invalidate'

export interface DatabaseEvent {
  type: DatabaseEventType
  tables: string[]
}
