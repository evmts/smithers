// SmithersProvider - Context provider for dependency injection
// Gives all child components access to database, executionId, and global controls

import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import type { SmithersDB } from '../db/index.js'

// ============================================================================
// GLOBAL STORE (for universal renderer compatibility)
// ============================================================================

// Module-level store for context value - used as fallback when
// React's Context API doesn't work in universal renderer mode
let globalSmithersContext: SmithersContextValue | null = null

// ============================================================================
// TYPES
// ============================================================================

export interface SmithersConfig {
  /**
   * Maximum number of iterations for Ralph loops
   */
  maxIterations?: number

  /**
   * Default model to use for agents
   */
  defaultModel?: string

  /**
   * Global timeout in milliseconds
   */
  globalTimeout?: number

  /**
   * Enable verbose logging
   */
  verbose?: boolean

  /**
   * Additional configuration
   */
  [key: string]: any
}

export interface SmithersContextValue {
  /**
   * Database instance
   */
  db: SmithersDB

  /**
   * Current execution ID
   */
  executionId: string

  /**
   * Configuration
   */
  config: SmithersConfig

  /**
   * Request orchestration stop
   */
  requestStop: (reason: string) => void

  /**
   * Request rebase operation
   */
  requestRebase: (reason: string) => void

  /**
   * Check if stop has been requested
   */
  isStopRequested: () => boolean

  /**
   * Check if rebase has been requested
   */
  isRebaseRequested: () => boolean
}

// ============================================================================
// CONTEXT
// ============================================================================

const SmithersContext = createContext<SmithersContextValue | undefined>(undefined)

/**
 * Hook to access Smithers context
 *
 * Uses React's Context API, but falls back to module-level store
 * for universal renderer compatibility where context propagation
 * may not work as expected.
 */
export function useSmithers() {
  // Try React's Context first
  const ctx = useContext(SmithersContext)
  if (ctx) {
    return ctx
  }

  // Fall back to global store for universal renderer
  if (globalSmithersContext) {
    return globalSmithersContext
  }

  throw new Error('useSmithers must be used within SmithersProvider')
}

// ============================================================================
// PROVIDER
// ============================================================================

export interface SmithersProviderProps {
  /**
   * Database instance
   */
  db: SmithersDB

  /**
   * Execution ID from db.execution.start()
   */
  executionId: string

  /**
   * Optional configuration
   */
  config?: SmithersConfig

  /**
   * Children components
   */
  children: ReactNode
}

/**
 * SmithersProvider - Root context provider
 *
 * Usage:
 * ```tsx
 * const db = await createSmithersDB({ path: '.smithers/data' })
 * const executionId = await db.execution.start('My Orchestration', './main.tsx')
 *
 * <SmithersProvider db={db} executionId={executionId}>
 *   <Orchestration>
 *     <Ralph>
 *       <Claude>Do something</Claude>
 *     </Ralph>
 *   </Orchestration>
 * </SmithersProvider>
 * ```
 */
export function SmithersProvider(props: SmithersProviderProps): ReactNode {
  // Global stop/rebase signals
  const [stopRequested, setStopRequested] = useState(false)
  const [rebaseRequested, setRebaseRequested] = useState(false)

  const value: SmithersContextValue = useMemo(() => ({
    db: props.db,
    executionId: props.executionId,
    config: props.config ?? {},

    requestStop: (reason: string) => {
      setStopRequested(true)

      // Log to database state
      props.db.state.set('stop_requested', {
        reason,
        timestamp: Date.now(),
        executionId: props.executionId,
      })

      console.log(`[Smithers] Stop requested: ${reason}`)
    },

    requestRebase: (reason: string) => {
      setRebaseRequested(true)

      // Log to database state
      props.db.state.set('rebase_requested', {
        reason,
        timestamp: Date.now(),
        executionId: props.executionId,
      })

      console.log(`[Smithers] Rebase requested: ${reason}`)
    },

    isStopRequested: () => stopRequested,
    isRebaseRequested: () => rebaseRequested,
  }), [props.db, props.executionId, props.config, stopRequested, rebaseRequested])

  // Set global store BEFORE any children are evaluated
  // This is critical for universal renderer compatibility where
  // React's Context API may not propagate properly
  globalSmithersContext = value

  return (
    <SmithersContext.Provider value={value}>
      {props.children}
    </SmithersContext.Provider>
  )
}
