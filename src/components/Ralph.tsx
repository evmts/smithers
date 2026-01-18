import { createContext, type ReactNode } from 'react'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { useSmithers, type RalphContextType } from './SmithersProvider.js'

// Re-export RalphContextType for backwards compatibility
export type { RalphContextType } from './SmithersProvider.js'

/**
 * Ralph context - DEPRECATED
 *
 * Use useSmithers() and db.tasks.start()/complete() instead:
 *
 * Before:
 * ```tsx
 * const ralph = useContext(RalphContext)
 * ralph?.registerTask()
 * // ... do work ...
 * ralph?.completeTask()
 * ```
 *
 * After:
 * ```tsx
 * const { db } = useSmithers()
 * const taskId = db.tasks.start('component-type', 'component-name')
 * try {
 *   // ... do work ...
 * } finally {
 *   db.tasks.complete(taskId)
 * }
 * ```
 *
 * For ralphCount, use useRalphCount() hook instead.
 *
 * @deprecated Use useSmithers() and db.tasks instead
 */
export const RalphContext = createContext<RalphContextType | undefined>(undefined)

// Re-export orchestration signals from SmithersProvider
export {
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
} from './SmithersProvider.js'

export interface RalphProps {
  maxIterations?: number
  onIteration?: (iteration: number) => void
  onComplete?: () => void
  children?: ReactNode
  /**
   * @deprecated Database is now provided via SmithersProvider
   */
  db?: ReactiveDatabase
}

/**
 * Ralph component - DEPRECATED backwards compatibility wrapper
 *
 * The Ralph loop is now managed by SmithersProvider directly, and task
 * tracking is now database-backed via the tasks table.
 *
 * This component exists for:
 * 1. Backwards compatibility with existing code using <Ralph>
 * 2. Providing RalphContext for components using useContext(RalphContext)
 * 3. Rendering the <ralph> custom element for XML serialization
 *
 * New code should use SmithersProvider directly without Ralph:
 * ```tsx
 * <SmithersProvider db={db} executionId={id} maxIterations={10}>
 *   <Orchestration>
 *     <Claude>...</Claude>
 *   </Orchestration>
 * </SmithersProvider>
 * ```
 *
 * Task tracking in components should use db.tasks:
 * ```tsx
 * const { db } = useSmithers()
 * const ralphCount = useRalphCount()
 * const taskId = db.tasks.start('component-type')
 * try { ... } finally { db.tasks.complete(taskId) }
 * ```
 *
 * @deprecated Use SmithersProvider directly with db.tasks for task tracking
 */
export function Ralph(props: RalphProps): ReactNode {
  // Get context from SmithersProvider
  const smithers = useSmithers()

  // Build RalphContext value from SmithersProvider
  // Note: registerTask/completeTask are deprecated no-ops
  const contextValue: RalphContextType = {
    registerTask: smithers.registerTask,
    completeTask: smithers.completeTask,
    ralphCount: smithers.ralphCount,
    db: smithers.reactiveDb,
  }

  // Note: maxIterations, onIteration, onComplete from props are ignored here
  // since they should be passed to SmithersProvider instead.
  // This component is primarily for backwards compatibility.

  return (
    <RalphContext.Provider value={contextValue}>
      <ralph
        iteration={smithers.ralphCount}
        maxIterations={props.maxIterations ?? smithers.config.maxIterations ?? 100}
      >
        {props.children}
      </ralph>
    </RalphContext.Provider>
  )
}
