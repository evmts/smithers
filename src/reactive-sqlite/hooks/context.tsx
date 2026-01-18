/**
 * React Context Provider for ReactiveDatabase
 *
 * Provides database access throughout the component tree without prop drilling.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { ReactiveDatabase } from '../database'

/**
 * Context for the ReactiveDatabase instance
 */
const DatabaseContext = createContext<ReactiveDatabase | null>(null)

/**
 * Props for DatabaseProvider
 */
interface DatabaseProviderProps {
  /** The ReactiveDatabase instance to provide */
  db: ReactiveDatabase
  /** Child components */
  children: ReactNode
}

/**
 * Provider component that makes a ReactiveDatabase available to child components
 *
 * @example
 * ```tsx
 * const db = new ReactiveDatabase(':memory:')
 *
 * function App() {
 *   return (
 *     <DatabaseProvider db={db}>
 *       <UserList />
 *     </DatabaseProvider>
 *   )
 * }
 * ```
 */
export function DatabaseProvider({ db, children }: DatabaseProviderProps) {
  return (
    <DatabaseContext.Provider value={db}>
      {children}
    </DatabaseContext.Provider>
  )
}

/**
 * Hook to access the ReactiveDatabase from context
 *
 * @throws Error if used outside of a DatabaseProvider
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const db = useDatabase()
 *   const users = db.query('SELECT * FROM users')
 *   return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
 * }
 * ```
 */
export function useDatabase(): ReactiveDatabase {
  const db = useContext(DatabaseContext)
  if (!db) {
    throw new Error('useDatabase must be used within a DatabaseProvider')
  }
  return db
}

/**
 * Hook to optionally access the ReactiveDatabase from context
 * Returns null if not within a provider (useful for hooks that accept optional db)
 */
export function useDatabaseOptional(): ReactiveDatabase | null {
  return useContext(DatabaseContext)
}

export { DatabaseContext }
