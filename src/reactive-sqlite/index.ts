/**
 * Reactive SQLite for React (Bun)
 *
 * A lightweight reactive wrapper around bun:sqlite with React hooks.
 *
 * @example
 * ```tsx
 * import { ReactiveDatabase, useQuery, useMutation } from './reactive-sqlite'
 *
 * const db = new ReactiveDatabase('mydb.sqlite')
 *
 * // Initialize schema
 * db.exec(`
 *   CREATE TABLE IF NOT EXISTS users (
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     name TEXT NOT NULL,
 *     active INTEGER DEFAULT 1
 *   )
 * `)
 *
 * function MyComponent() {
 *   const { data: users } = useQuery(db, 'SELECT * FROM users WHERE active = ?', [1])
 *   const { mutate: addUser } = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
 *
 *   return (
 *     <div>
 *       {users.map(u => <div key={u.id}>{u.name}</div>)}
 *       <button onClick={() => addUser('New User')}>Add User</button>
 *     </div>
 *   )
 * }
 * ```
 */

// Database
export { ReactiveDatabase, createReactiveDatabase } from './database.js'

// Hooks
export { useQuery, useQueryOne, useQueryValue, useMutation } from './hooks.js'

// Parser utilities
export { extractReadTables, extractWriteTables, isWriteOperation, extractAllTables } from './parser.js'

// Types
export type {
  QuerySubscription,
  SubscriptionCallback,
  QueryState,
  MutationState,
  UseQueryResult,
  UseMutationResult,
  UseQueryOptions,
  UseMutationOptions,
  ReactiveDatabaseConfig,
  DatabaseEvent,
  DatabaseEventType,
} from './types.js'
