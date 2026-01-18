import { createContext, type ReactNode } from 'react'
import type { ReactiveDatabase } from '../reactive-sqlite'
import { useSmithers, type RalphContextType } from './SmithersProvider'

// Re-export RalphContextType for backwards compatibility
export type { RalphContextType } from './SmithersProvider'

/**
 * Ralph context - now just provides access to SmithersProvider context values.
 * Kept for backwards compatibility with components using useContext(RalphContext).
 */
export const RalphContext = createContext<RalphContextType | undefined>(undefined)

// Re-export orchestration signals from SmithersProvider
export {
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
} from './SmithersProvider'

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
 * Ralph component - Thin wrapper for backwards compatibility
 *
 * The Ralph loop is now managed by SmithersProvider directly.
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
 */
export function Ralph(props: RalphProps): ReactNode {
  // Get context from SmithersProvider
  const smithers = useSmithers()

  // Build RalphContext value from SmithersProvider
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
