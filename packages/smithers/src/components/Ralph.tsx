import { createSignal, createContext, createEffect } from '../solid-shim.js'
import type { JSX } from 'solid-js'

interface RalphContextValue {
  registerTask: () => void
  completeTask: () => void
}

export const RalphContext = createContext<RalphContextValue>()

export interface RalphProps {
  children?: JSX.Element
  maxIterations?: number
  onIteration?: (iteration: number) => void
}

/**
 * Ralph component - remount controller for the Ralph Wiggum loop.
 *
 * "I'm going, I'm going!" - Ralph keeps remounting children until all work is done.
 *
 * When all registered tasks complete, Ralph increments a key to force a remount.
 * This gives fresh component state for the next iteration.
 *
 * @example
 * ```tsx
 * <Ralph maxIterations={10}>
 *   {step() === 1 && <Claude onFinished={() => setStep(2)}>Step 1</Claude>}
 *   {step() === 2 && <Claude onFinished={() => setStep(3)}>Step 2</Claude>}
 * </Ralph>
 * ```
 */
export function Ralph(props: RalphProps) {
  const [key, setKey] = createSignal(0)
  const [pendingTasks, setPendingTasks] = createSignal(0)
  const [iteration, setIteration] = createSignal(0)

  createEffect(() => {
    // When all tasks complete and we've had at least one iteration
    if (pendingTasks() === 0 && key() > 0) {
      const nextIteration = iteration() + 1
      const maxIter = props.maxIterations || Infinity

      if (nextIteration < maxIter) {
        setIteration(nextIteration)
        setKey((k: number) => k + 1) // Trigger remount
        props.onIteration?.(nextIteration)
      }
    }
  })

  const registerTask = () => setPendingTasks((p: number) => p + 1)
  const completeTask = () => setPendingTasks((p: number) => p - 1)

  return (
    <RalphContext.Provider value={{ registerTask, completeTask }}>
      <ralph iteration={iteration()} pending={pendingTasks()} key={key()}>
        {props.children}
      </ralph>
    </RalphContext.Provider>
  )
}
