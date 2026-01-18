// SmithersProvider - Context provider for dependency injection
// Gives all child components access to PGlite database, executionId, and global controls

import { createContext, useContext, createSignal, type JSX } from 'solid-js'
import type { SmithersDB } from '../db/index.js'

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
   * PGlite database instance
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

const SmithersContext = createContext<SmithersContextValue>()

/**
 * Hook to access Smithers context
 */
export function useSmithers() {
  const ctx = useContext(SmithersContext)
  if (!ctx) {
    throw new Error('useSmithers must be used within SmithersProvider')
  }
  return ctx
}

// ============================================================================
// PROVIDER
// ============================================================================

export interface SmithersProviderProps {
  /**
   * PGlite database instance
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
  children: JSX.Element
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
export function SmithersProvider(props: SmithersProviderProps): JSX.Element {
  // Global stop/rebase signals
  const [stopRequested, setStopRequested] = createSignal(false)
  const [rebaseRequested, setRebaseRequested] = createSignal(false)

  const value: SmithersContextValue = {
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

    isStopRequested: stopRequested,
    isRebaseRequested: rebaseRequested,
  }

  // Use a function to render children lazily after context is established
  // This is important for Solid.js universal renderer where children may
  // be evaluated eagerly before the context provider is set up
  const renderChildren = () => props.children

  return (
    <SmithersContext.Provider value={value}>
      {renderChildren()}
    </SmithersContext.Provider>
  )
}
