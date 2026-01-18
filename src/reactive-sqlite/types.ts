/**
 * Types for the reactive SQLite library
 */

import type { Database, Statement } from 'bun:sqlite'

/**
 * Subscription callback type
 */
export type SubscriptionCallback = () => void

/**
 * Query subscription info
 */
export interface QuerySubscription {
  id: string
  tables: Set<string>
  callback: SubscriptionCallback
}

/**
 * Query result state
 */
export interface QueryState<T> {
  data: T[]
  isLoading: boolean
  error: Error | null
}

/**
 * Mutation result state
 */
export interface MutationState {
  isLoading: boolean
  error: Error | null
}

/**
 * useQuery return type
 */
export interface UseQueryResult<T> extends QueryState<T> {
  refetch: () => void
}

/**
 * useMutation return type
 */
export interface UseMutationResult<TParams extends any[] = any[]> extends MutationState {
  mutate: (...params: TParams) => void
  mutateAsync: (...params: TParams) => Promise<void>
}

/**
 * Options for useQuery
 */
export interface UseQueryOptions {
  /** Whether to skip the query */
  skip?: boolean
  /** Additional dependencies that trigger re-fetch */
  deps?: any[]
}

/**
 * Options for useMutation
 */
export interface UseMutationOptions {
  /** Tables to invalidate after mutation (auto-detected if not provided) */
  invalidateTables?: string[]
  /** Callback after successful mutation */
  onSuccess?: () => void
  /** Callback after failed mutation */
  onError?: (error: Error) => void
}

/**
 * ReactiveDatabase configuration
 */
export interface ReactiveDatabaseConfig {
  /** Path to SQLite database file (use ':memory:' for in-memory) */
  path: string
  /** Whether to create the database if it doesn't exist */
  create?: boolean
  /** Whether to open in read-only mode */
  readonly?: boolean
}

/**
 * Event types for database changes
 */
export type DatabaseEventType = 'insert' | 'update' | 'delete' | 'invalidate'

/**
 * Database change event
 */
export interface DatabaseEvent {
  type: DatabaseEventType
  tables: string[]
}
