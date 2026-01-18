// Step component with automatic sequential execution within phases
// Steps execute one after another unless wrapped in <Parallel>

import { createContext, useContext, useState, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { jjSnapshot, jjCommit } from '../utils/vcs.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

// ============================================================================
// STEP REGISTRY CONTEXT (for sequential execution within a phase)
// ============================================================================

interface StepRegistryContextValue {
  registerStep: (name: string) => number
  currentStepIndex: number
  advanceStep: () => void
  isStepActive: (index: number) => boolean
  isStepCompleted: (index: number) => boolean
  isParallel: boolean
}

const StepRegistryContext = createContext<StepRegistryContextValue | undefined>(undefined)

function useStepRegistry(): StepRegistryContextValue | undefined {
  return useContext(StepRegistryContext)
}

function useStepIndex(name: string | undefined): number {
  const registry = useStepRegistry()
  const [index] = useState(() => {
    if (!registry) return 0
    return registry.registerStep(name ?? 'unnamed')
  })
  return index
}

// ============================================================================
// STEP REGISTRY PROVIDER (automatically wraps Phase children)
// ============================================================================

export interface StepRegistryProviderProps {
  children: ReactNode
  phaseId?: string
  isParallel?: boolean
}

export function StepRegistryProvider(props: StepRegistryProviderProps): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const stateKey = `stepIndex_${props.phaseId ?? 'default'}`

  // Track registered steps
  const [steps, setSteps] = useState<string[]>([])

  // Read current step index from SQLite (for sequential mode)
  const { data: dbStepIndex } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?`,
    [stateKey]
  )

  const currentStepIndex = props.isParallel ? -1 : (dbStepIndex ?? 0)

  // Initialize step index in DB
  useMount(() => {
    if (!props.isParallel) {
      const existing = db.state.get<number>(stateKey)
      if (existing === null) {
        db.state.set(stateKey, 0, 'step_registry_init')
      }
    }
  })

  const registerStep = useCallback((name: string): number => {
    let index = -1
    setSteps(prev => {
      const existingIndex = prev.indexOf(name)
      if (existingIndex >= 0) {
        index = existingIndex
        return prev
      }
      index = prev.length
      return [...prev, name]
    })
    return index >= 0 ? index : steps.length
  }, [steps.length])

  const advanceStep = useCallback(() => {
    if (props.isParallel) return
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      db.state.set(stateKey, nextIndex, 'step_advance')
    }
  }, [db, stateKey, currentStepIndex, steps.length, props.isParallel])

  const isStepActive = useCallback((index: number): boolean => {
    if (props.isParallel) return true // All steps active in parallel mode
    return index === currentStepIndex
  }, [currentStepIndex, props.isParallel])

  const isStepCompleted = useCallback((index: number): boolean => {
    if (props.isParallel) return false
    return index < currentStepIndex
  }, [currentStepIndex, props.isParallel])

  const value = useMemo((): StepRegistryContextValue => ({
    registerStep,
    currentStepIndex,
    advanceStep,
    isStepActive,
    isStepCompleted,
    isParallel: props.isParallel ?? false,
  }), [registerStep, currentStepIndex, advanceStep, isStepActive, isStepCompleted, props.isParallel])

  return (
    <StepRegistryContext.Provider value={value}>
      {props.children}
    </StepRegistryContext.Provider>
  )
}

// ============================================================================
// STEP COMPONENT
// ============================================================================

export interface StepProps {
  /**
   * Step name
   */
  name?: string

  /**
   * Children components
   */
  children: ReactNode

  /**
   * Create JJ snapshot before executing
   */
  snapshotBefore?: boolean

  /**
   * Create JJ snapshot after executing
   */
  snapshotAfter?: boolean

  /**
   * Create JJ commit after executing
   */
  commitAfter?: boolean

  /**
   * Commit message (if commitAfter is true)
   */
  commitMessage?: string

  /**
   * Callback when step starts
   */
  onStart?: () => void

  /**
   * Callback when step completes
   */
  onComplete?: () => void
}

/**
 * Step component with automatic sequential execution
 *
 * Steps within a Phase execute sequentially by default.
 * Wrap in <Parallel> for concurrent execution.
 *
 * @example
 * ```tsx
 * <Phase name="Build">
 *   <Step name="Write code">
 *     <Claude>Write the implementation</Claude>
 *   </Step>
 *   <Step name="Write tests">
 *     <Claude>Write tests for the implementation</Claude>
 *   </Step>
 * </Phase>
 * ```
 */
export function Step(props: StepProps): ReactNode {
  const { db } = useSmithers()
  const registry = useStepRegistry()
  const myIndex = useStepIndex(props.name)

  const [, setStepId] = useState<string | null>(null)
  const [, setStatus] = useState<'pending' | 'active' | 'completed' | 'failed'>('pending')
  const stepIdRef = useRef<string | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const snapshotBeforeIdRef = useRef<string | undefined>(undefined)
  const snapshotAfterIdRef = useRef<string | undefined>(undefined)
  const commitHashRef = useRef<string | undefined>(undefined)

  // Determine if this step should be active
  // If no registry (not inside a Phase), always active
  const isActive = registry ? registry.isStepActive(myIndex) : true
  const isCompleted = registry ? registry.isStepCompleted(myIndex) : false
  const status = isActive ? 'active' : isCompleted ? 'completed' : 'pending'

  useMount(() => {
    if (!isActive || hasStartedRef.current) return
    hasStartedRef.current = true

    ;(async () => {
      // Register task with database
      taskIdRef.current = db.tasks.start('step', props.name)

      try {
        // Snapshot before if requested
        if (props.snapshotBefore) {
          try {
            const { changeId } = await jjSnapshot(`Before step: ${props.name ?? 'unnamed'}`)
            snapshotBeforeIdRef.current = changeId
            console.log(`[Step] Created snapshot before: ${changeId}`)
          } catch (error) {
            console.warn('[Step] Could not create snapshot before:', error)
          }
        }

        // Start step in database
        const id = db.steps.start(props.name)
        setStepId(id)
        stepIdRef.current = id
        setStatus('active')

        console.log(`[Step] Started: ${props.name ?? 'unnamed'}`)

        props.onStart?.()
      } catch (error) {
        console.error(`[Step] Error starting step:`, error)
        setStatus('failed')

        if (stepIdRef.current) {
          db.steps.fail(stepIdRef.current)
        }

        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  useUnmount(() => {
    if (!hasStartedRef.current || hasCompletedRef.current) return
    hasCompletedRef.current = true

    ;(async () => {
      const id = stepIdRef.current
      if (!id) return

      try {
        // Snapshot after if requested
        if (props.snapshotAfter) {
          try {
            const { changeId } = await jjSnapshot(`After step: ${props.name ?? 'unnamed'}`)
            snapshotAfterIdRef.current = changeId
            console.log(`[Step] Created snapshot after: ${changeId}`)
          } catch (error) {
            console.warn('[Step] Could not create snapshot after:', error)
          }
        }

        // Commit if requested
        if (props.commitAfter) {
          try {
            const message = props.commitMessage ?? `Step: ${props.name ?? 'unnamed'}`
            const result = await jjCommit(message)
            commitHashRef.current = result.commitHash

            console.log(`[Step] Created commit: ${commitHashRef.current}`)

            db.vcs.logCommit({
              vcs_type: 'jj',
              commit_hash: result.commitHash,
              change_id: result.changeId,
              message,
            })
          } catch (error) {
            console.warn('[Step] Could not create commit:', error)
          }
        }

        // Complete step in database
        db.steps.complete(id, {
          ...(snapshotBeforeIdRef.current ? { snapshot_before: snapshotBeforeIdRef.current } : {}),
          ...(snapshotAfterIdRef.current ? { snapshot_after: snapshotAfterIdRef.current } : {}),
          ...(commitHashRef.current ? { commit_created: commitHashRef.current } : {}),
        })

        setStatus('completed')
        console.log(`[Step] Completed: ${props.name ?? 'unnamed'}`)

        props.onComplete?.()

        // Advance to next step
        registry?.advanceStep()
      } catch (error) {
        console.error(`[Step] Error completing step:`, error)
        db.steps.fail(id)
        setStatus('failed')
      } finally {
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  // Always render the step element, only render children when active
  return (
    <step {...(props.name ? { name: props.name } : {})} status={status}>
      {isActive && props.children}
    </step>
  )
}
