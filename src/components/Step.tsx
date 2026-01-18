// Step component with automatic sequential execution within phases
// Steps execute one after another unless wrapped in <Parallel>

import { createContext, useContext, useRef, useCallback, useMemo, useEffect, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { jjSnapshot, jjCommit } from '../utils/vcs.js'
import { useMount, useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
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

export function useStepRegistry(): StepRegistryContextValue | undefined {
  return useContext(StepRegistryContext)
}

export function useStepIndex(name: string | undefined): number {
  const registry = useStepRegistry()
  const indexRef = useRef<number | null>(null)
  if (indexRef.current === null) {
    indexRef.current = registry ? registry.registerStep(name ?? 'unnamed') : 0
  }
  return indexRef.current
}

// ============================================================================
// STEP REGISTRY PROVIDER (automatically wraps Phase children)
// ============================================================================

export interface StepRegistryProviderProps {
  children: ReactNode
  phaseId?: string
  isParallel?: boolean
  onAllStepsComplete?: () => void
}

export function StepRegistryProvider(props: StepRegistryProviderProps): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const stateKey = `stepIndex_${props.phaseId ?? 'default'}`

  // Track registered steps using ref for synchronous updates during render
  // This avoids race conditions when multiple Step components mount simultaneously
  const stepsRef = useRef<string[]>([])

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
    const existingIndex = stepsRef.current.indexOf(name)
    if (existingIndex >= 0) {
      return existingIndex
    }
    const index = stepsRef.current.length
    stepsRef.current.push(name)
    return index
  }, []) // No dependencies needed - ref is mutable

  const advanceStep = useCallback(() => {
    if (props.isParallel) return
    const nextIndex = currentStepIndex + 1
    if (nextIndex < stepsRef.current.length) {
      db.state.set(stateKey, nextIndex, 'step_advance')
    } else {
      // All steps complete - signal phase completion
      props.onAllStepsComplete?.()
    }
  }, [db, stateKey, currentStepIndex, props.isParallel, props.onAllStepsComplete])

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
  const { db, reactiveDb, executionId } = useSmithers()
  const registry = useStepRegistry()
  const myIndex = useStepIndex(props.name)

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

  // Monitor child tasks for this step (only when started)
  // Uses the same pattern as SmithersProvider for reactive task counting
  const { data: childRunningTaskCount } = useQueryValue<number>(
    reactiveDb,
    hasStartedRef.current && taskIdRef.current
      ? `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND status = 'running' AND id != ?`
      : `SELECT 0 as count`,
    hasStartedRef.current && taskIdRef.current
      ? [executionId, taskIdRef.current]
      : []
  )

  // Reactive step activation - runs when isActive becomes true
  // Pattern from Claude.tsx:110, Smithers.tsx:170
  useEffectOnValueChange(isActive, () => {
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
        stepIdRef.current = id

        console.log(`[Step] Started: ${props.name ?? 'unnamed'}`)

        props.onStart?.()
      } catch (error) {
        console.error(`[Step] Error starting step:`, error)

        if (stepIdRef.current) {
          db.steps.fail(stepIdRef.current)
        }

        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  // Helper to complete the step
  const completeStep = useCallback(async () => {
    if (!hasStartedRef.current || hasCompletedRef.current) return
    hasCompletedRef.current = true

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

      console.log(`[Step] Completed: ${props.name ?? 'unnamed'}`)

      props.onComplete?.()

      // Advance to next step
      registry?.advanceStep()
    } catch (error) {
      console.error(`[Step] Error completing step:`, error)
      db.steps.fail(id)
    } finally {
      if (taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
      }
    }
  }, [db, registry, props])

  // Reactive completion detection - when step has started and all child tasks are done
  useEffect(() => {
    if (!hasStartedRef.current || hasCompletedRef.current || childRunningTaskCount !== 0) {
      return
    }
    // Small delay to ensure child tasks have actually registered
    // This prevents completing before children even start
    const timeoutId = setTimeout(() => {
      if (hasStartedRef.current && !hasCompletedRef.current) {
        completeStep()
      }
    }, 100)
    return () => clearTimeout(timeoutId)
  }, [childRunningTaskCount, completeStep])

  // Cleanup on unmount (for edge cases like component disposal)
  useUnmount(() => {
    if (hasStartedRef.current && !hasCompletedRef.current) {
      completeStep()
    }
  })

  // Always render the step element, only render children when active
  return (
    <step {...(props.name ? { name: props.name } : {})} status={status}>
      {isActive && props.children}
    </step>
  )
}
