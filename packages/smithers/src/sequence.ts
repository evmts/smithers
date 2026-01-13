/**
 * Sequence helpers for multi-phase agent execution
 *
 * Provides idiomatic patterns for managing sequential phases/steps
 * without manual signal management.
 */

import { createSignal, createMemo } from './solid-shim.js'

/**
 * Create a sequence of phases that execute one at a time
 *
 * @example
 * ```tsx
 * const seq = createSequence(['research', 'write', 'review'])
 *
 * return (
 *   <Show when={!seq.done()}>
 *     <Phase name={seq.current()}>
 *       <Claude onFinished={seq.next}>
 *         {seq.current() === 'research' && 'Research the topic'}
 *         {seq.current() === 'write' && 'Write the article'}
 *         {seq.current() === 'review' && 'Review and polish'}
 *       </Claude>
 *     </Phase>
 *   </Show>
 * )
 * ```
 */
export function createSequence<T extends string>(phases: T[]) {
  const [index, setIndex] = createSignal(0)

  const current = createMemo(() => {
    const i = index()
    return i < phases.length ? phases[i] : null
  })

  const done = createMemo(() => index() >= phases.length)

  const next = () => {
    setIndex(i => Math.min(i + 1, phases.length))
  }

  const reset = () => setIndex(0)

  const goTo = (phase: T) => {
    const i = phases.indexOf(phase)
    if (i !== -1) setIndex(i)
  }

  return {
    /** Current phase name (null if done) */
    current,
    /** Whether all phases are complete */
    done,
    /** Move to next phase */
    next,
    /** Reset to first phase */
    reset,
    /** Jump to specific phase */
    goTo,
    /** Current phase index */
    index,
    /** Total number of phases */
    total: phases.length,
    /** List of all phases */
    phases,
    /** Check if a specific phase is current */
    is: (phase: T) => current() === phase,
    /** Check if a phase has been completed */
    completed: (phase: T) => {
      const phaseIndex = phases.indexOf(phase)
      return phaseIndex !== -1 && phaseIndex < index()
    },
  }
}

/**
 * Create a checklist of steps that can be marked done in any order
 *
 * @example
 * ```tsx
 * const steps = createChecklist(['fetch-data', 'validate', 'transform'])
 *
 * return (
 *   <>
 *     <Show when={!steps.isDone('fetch-data')}>
 *       <Claude onFinished={() => steps.markDone('fetch-data')}>
 *         Fetch the data
 *       </Claude>
 *     </Show>
 *     <Show when={!steps.isDone('validate')}>
 *       <Claude onFinished={() => steps.markDone('validate')}>
 *         Validate the data
 *       </Claude>
 *     </Show>
 *   </>
 * )
 * ```
 */
export function createChecklist<T extends string>(steps: T[]) {
  const [completed, setCompleted] = createSignal<Set<T>>(new Set())

  const markDone = (step: T) => {
    setCompleted(prev => new Set([...prev, step]))
  }

  const markUndone = (step: T) => {
    setCompleted(prev => {
      const next = new Set(prev)
      next.delete(step)
      return next
    })
  }

  const isDone = (step: T) => completed().has(step)

  const allDone = createMemo(() =>
    steps.every(step => completed().has(step))
  )

  const pending = createMemo(() =>
    steps.filter(step => !completed().has(step))
  )

  const reset = () => setCompleted(new Set<T>())

  return {
    /** Mark a step as done */
    markDone,
    /** Mark a step as not done */
    markUndone,
    /** Check if a step is done */
    isDone,
    /** Check if all steps are done */
    allDone,
    /** Get list of pending steps */
    pending,
    /** Reset all steps to pending */
    reset,
    /** Set of completed steps */
    completed,
    /** All steps */
    steps,
  }
}

/**
 * Create a simple done signal for a single phase/step
 *
 * @example
 * ```tsx
 * const research = createStep()
 *
 * return (
 *   <Show when={!research.done()}>
 *     <Claude onFinished={research.complete}>
 *       Research the topic
 *     </Claude>
 *   </Show>
 * )
 * ```
 */
export function createStep() {
  const [done, setDone] = createSignal(false)

  return {
    /** Whether the step is done */
    done,
    /** Mark the step as complete */
    complete: () => setDone(true),
    /** Reset the step */
    reset: () => setDone(false),
  }
}
