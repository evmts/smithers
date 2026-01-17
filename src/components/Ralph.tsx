import { createContext, createSignal, onMount, type JSX } from 'solid-js'

/**
 * Ralph context for task tracking.
 * Components like Claude register with Ralph when they mount.
 */
export interface RalphContextType {
  registerTask: () => void
  completeTask: () => void
}

export const RalphContext = createContext<RalphContextType | undefined>(undefined)

export interface RalphProps {
  maxIterations?: number
  onIteration?: (iteration: number) => void
  children?: JSX.Element
}

/**
 * Ralph component - manages the remount loop.
 *
 * The Ralph Wiggum loop:
 * 1. Render children (which may contain Claude components)
 * 2. Claude components execute on mount
 * 3. When tasks complete, increment key to force remount
 * 4. Repeat until no more tasks or maxIterations reached
 *
 * This is the core orchestration pattern.
 */
export function Ralph(props: RalphProps): JSX.Element {
  const [iteration, setIteration] = createSignal(0)
  const [pendingTasks, setPendingTasks] = createSignal(0)
  const [key, setKey] = createSignal(0)

  const maxIterations = props.maxIterations || 100

  const contextValue: RalphContextType = {
    registerTask: () => {
      setPendingTasks((p: number) => p + 1)
    },
    completeTask: () => {
      setPendingTasks((p: number) => p - 1)
    },
  }

  onMount(() => {
    // Monitor pending tasks and trigger remount when all complete
    let checkInterval: NodeJS.Timeout | null = null

    checkInterval = setInterval(() => {
      if (pendingTasks() === 0 && iteration() < maxIterations) {
        // All tasks complete, trigger remount for next iteration
        const nextIteration = iteration() + 1
        setIteration(nextIteration)
        setKey((k: number) => k + 1)

        if (props.onIteration) {
          props.onIteration(nextIteration)
        }

        // Stop if we hit max iterations
        if (nextIteration >= maxIterations) {
          if (checkInterval) clearInterval(checkInterval)
        }
      }
    }, 10) // Check every 10ms

    // Cleanup on unmount
    return () => {
      if (checkInterval) clearInterval(checkInterval)
    }
  })

  return (
    <RalphContext.Provider value={contextValue}>
      <ralph
        key={key()}
        iteration={iteration()}
        pending={pendingTasks()}
        maxIterations={maxIterations}
      >
        {props.children}
      </ralph>
    </RalphContext.Provider>
  )
}
